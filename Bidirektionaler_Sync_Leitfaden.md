# Bidirektionaler Sync FileMaker ↔ Web-App (Supabase) – Architektur-Leitfaden

Vollständiger Aufbau eines automatischen, bidirektionalen Syncs zwischen einer
FileMaker-Datenbank (Claris Pro/Server) und einer Web-App auf Supabase
(PostgreSQL + REST). Enthält Datenmodell, Echo-Vermeidung, Konfliktregel und
Server-Automatik. Praxiserprobt im Projekt "ImmoManager".

> Voraussetzung FileMaker-Seite: Skripte werden ausschließlich mit den acht
> sicheren Step-IDs gebaut, alle Operationen laufen über MBS-Funktionen in
> `Set Variable`. Siehe separaten Leitfaden "FileMaker-Skripte per XML erzeugen".

---

## 1. Grundprinzip

Zwei Systeme, beide dürfen Datensätze ändern:
- **FileMaker (FM)** = Desktop-/Server-Datenbank (Quelle vieler Stammdaten).
- **Web-App / Supabase** = PostgreSQL mit auto-generierter REST-API (PostgREST).

Der Sync besteht aus **Hinwegen** (FM → App) und **Rückwegen** (App → FM), je
Tabelle. Jede Richtung überträgt **neue UND geänderte** Datensätze. Kommunikation
immer über die Supabase-REST-API (`/rest/v1/<tabelle>`), aus FileMaker per MBS-CURL.

Schlüsselidee gegen Endlosschleifen: **getrennte Änderungsmarker pro Quelle**, damit
ein Sync-Schreibvorgang nicht als "echte Änderung" der Gegenseite missverstanden wird.

---

## 2. Supabase-Seite (Datenmodell)

### Pro fachlicher Tabelle (Beispiel `kontakte`, `objekte`)
- `id` BIGSERIAL PK, `created_at TIMESTAMPTZ DEFAULT now()`
- fachliche Felder
- **`fm_id` / `we_id` TEXT UNIQUE** – die FileMaker-ID des Datensatzes
  (Schlüssel fürs Upsert; `on_conflict=fm_id`). Als TEXT führen, das vermeidet
  Typprobleme.
- **`updated_at TIMESTAMPTZ`** – per Trigger bei jeder Änderung gesetzt
  (technischer Zeitstempel).
- **`app_modified_at TIMESTAMPTZ`** – wird **nur von der App** gesetzt, wenn ein
  Mensch in der App etwas ändert. Dies ist der entscheidende Marker für die
  Echo-Vermeidung (siehe Abschnitt 5).

### Verknüpfungs-/Historientabelle (Beispiel `kontakt_historie`)
- `id`, `created_at`, Fremdschlüssel (`kontakt_id`), fachliche Felder
- **`fm_vorgang_id` TEXT UNIQUE** – ID des zugehörigen FileMaker-Datensatzes
- `updated_at`, `app_modified_at` wie oben

### Steuer-/Protokolltabellen
```sql
-- Merker "bis wann wurde schon synchronisiert", ein Schlüssel je Richtung/Tabelle
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  ts  TIMESTAMPTZ
);
-- Startwerte
INSERT INTO sync_state(key, ts) VALUES
  ('kontakte_pull', now()), ('objekte_pull', now()), ('historie_pull', now());

-- Protokoll für automatische Server-Läufe
CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  bericht TEXT
);
```

### Trigger für updated_at
```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kontakte_updated BEFORE UPDATE ON kontakte
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- analog für objekte, kontakt_historie
```

### RLS
Row Level Security aktiv lassen. Die App nutzt den **anon-Key** (eingeschränkt),
FileMaker nutzt den **service_role-Key** (umgeht RLS; nur serverseitig/in FileMaker
speichern, nie im Frontend).

---

## 3. App-Seite (entscheidend für Echo-Vermeidung)

Bei **jedem** schreibenden Vorgang in der App `app_modified_at` mitsenden:

```js
// Update
await supabase.from("kontakte")
  .update({ ...felder, app_modified_at: new Date().toISOString() })
  .eq("id", id);

// Insert
await supabase.from("kontakte")
  .insert([{ ...daten, app_modified_at: new Date().toISOString() }]);
```

An **allen** Schreibstellen einbauen (Hauptdatensatz speichern, Teil-Felder
speichern, Historieneintrag anlegen, Historieneintrag ändern). Der Hinweg
(FM → App) setzt `app_modified_at` NICHT → dadurch entsteht kein Echo.

---

## 4. Die acht Sync-Bausteine (FileMaker-Skripte)

Pro Tabelle ein Hinweg und ein Rückweg. Namen aus dem Referenzprojekt:

| Skript | Richtung | Inhalt |
|---|---|---|
| FM_10 | FM → App | Objekte upsert (neu + geändert) |
| FM_11 | FM → App | Kontakte upsert |
| FM_03 | FM → App | Historie/Vorgänge upsert |
| FM_20 | App → FM | Kontakte zurückschreiben |
| FM_21 | App → FM | Objekte zurückschreiben (nur Textfelder, s. u.) |
| FM_22 | App → FM | NEUE Historieneinträge anlegen |
| FM_23 | App → FM | GEÄNDERTE Historieneinträge aktualisieren |

### Hinweg (FM → App), z. B. FM_11
1. Datensätze lesen: `MBS("FM.SQL.Execute"; ""; "SELECT … FROM \"Interessenten\" WHERE \"IM_sync\" = 'x'")`
   → `MBS("FM.SQL.JSONRecords"; $ref; feldliste)` → `FM.SQL.Release`.
   (`IM_sync='x'` = dauerhafter Marker "gehört zur App".)
2. JSON aufbereiten (leere Strings → `null`, JSON-`null` → `""`, Status/Typ
   übersetzen falls nötig).
3. Upsert via CURL POST auf `/rest/v1/kontakte` mit Headern
   `Prefer: return=representation,resolution=merge-duplicates` und Query
   `?on_conflict=fm_id`.
4. Optional: zurückgegebene Supabase-`id` in ein FM-Feld zurückschreiben.

### Rückweg (App → FM), z. B. FM_20
1. Merker lesen: GET `/rest/v1/sync_state?key=eq.kontakte_pull&select=ts` → `$seit`.
2. Geänderte App-Datensätze holen: GET
   `/rest/v1/kontakte?app_modified_at=gt.<urlenc($seit)>&fm_id=not.is.null&order=app_modified_at.asc&select=…,app_modified_at`.
   **Filter auf `app_modified_at`, NICHT `updated_at`** (sonst Echo).
3. Pro Datensatz `UPDATE "Interessenten" SET … WHERE "Interessenten_ID"=?`
   via `MBS("FM.ExecuteFileSQL"; …; 9; 13; $params…)`.
4. Merker fortschreiben (s. Abschnitt 5, "Sperr-sichere Marker").

---

## 5. Echo-Vermeidung (Phase C1)

**Problem:** Schreibt der Hinweg in Supabase, springt `updated_at` an. Filtert der
Rückweg auf `updated_at`, hält er das für eine echte App-Änderung und schreibt
alles wieder nach FM zurück → Endlosschleife / unnötige Massen-Writes.

**Lösung:** Rückweg filtert auf **`app_modified_at`** (nur die App setzt es). Der
Hinweg fasst `app_modified_at` nicht an → keine Echos. Praktisch bestätigt:
Hinweg überträgt N Datensätze, der unmittelbar folgende Rückweg meldet
"keine Änderungen".

### Sperr-sichere Marker-Fortschreibung
Beim Zurückschreiben kann ein FM-Datensatz gesperrt sein (offen im Client). Damit
ein gesperrter Satz nicht "übersprungen und vergessen" wird:
- In der Schleife ein Flag `$blockiert` führen.
- Den Merker nur bis zum **letzten lückenlos erfolgreichen** Datensatz vorschieben
  (`$maxTs` nur setzen, solange `$blockiert = 0`).
- So werden gesperrte Sätze beim nächsten Lauf erneut versucht.
- Danach PATCH `/rest/v1/sync_state?key=eq.kontakte_pull` mit `{"ts":"<maxTs>"}`.

---

## 6. Konfliktregel (Phase C2) – "App gewinnt" + Meldung

**Konflikt** = derselbe Datensatz wurde auf BEIDEN Seiten geändert: in der App
(`app_modified_at` neu) UND in FM (mit `IM_sync='x'` zum Hochladen markiert).

**Regel "App gewinnt" ergibt sich aus der Reihenfolge** im Sammelskript:
1. **Erst alle Rückwege** (App → FM): schreiben den App-Wert in FM.
2. **Dann alle Hinwege** (FM → App): lesen den – nun bereits aktualisierten –
   FM-Wert und schreiben ihn nach Supabase.
→ Der App-Wert setzt sich überall durch.

**Konflikt erkennen + melden:** Im Rückweg pro Datensatz prüfen, ob der FM-Satz
`IM_sync='x'` trägt:
```
$chk    = MBS("FM.SQL.Execute"; ""; "SELECT \"IM_sync\" FROM \"Interessenten\" WHERE \"Interessenten_ID\" = '" & $fmid & "'")
$imsync = MBS("FM.SQL.Text"; $chk; 0; 0)
$relc   = MBS("FM.SQL.Release"; $chk)
$konflikte = $konflikte & If($imsync = "x"; $name & " (ID " & $fmid & ")" & ¶; "")
```
Am Ende `$konflikte` in den Bericht aufnehmen ("KONFLIKTE (auch in FileMaker
geändert, App hat gewonnen): …").

---

## 7. Spezialfall: in der App neu erstellte Verknüpfungs-/Historieneinträge

App-erstellte Einträge haben anfangs keine FM-ID. Beim Anlegen in FM (FM_22) vergibt
FileMaker eine **automatische** ID (Seriennummer). Damit spätere Änderungen dieses
Eintrags (FM_23) den richtigen FM-Satz finden, muss diese echte ID zurück in die App.

**Mechanik (zuverlässig, ohne die neue ID vorher zu kennen):**
1. In der FM-Tabelle ein **Hilfs-Textfeld** anlegen, z. B. `IM_ID_merker`.
2. Beim INSERT die **App-Eintrags-ID** mit hineinschreiben (als TEXT! sonst
   `FQL0013` bei Textfeld):
   ```
   INSERT INTO "Int_Vorgänge" (…, "IM_ID_merker") VALUES (…, ?)   -- Param: GetAsText($appId)
   ```
3. Direkt danach die vergebene ID über den Merker auslesen:
   ```
   $vsql  = MBS("FM.SQL.Execute"; ""; "SELECT \"Vorgang_ID\" FROM \"Int_Vorgänge\" WHERE \"IM_ID_merker\" = '" & $appId & "'")
   $neuId = MBS("FM.SQL.Text"; $vsql; 0; 0)
   $relv  = MBS("FM.SQL.Release"; $vsql)
   ```
4. Diese echte ID per PATCH in Supabase `fm_vorgang_id` zurückschreiben
   (Fallback-Marker nur, falls Auslesen fehlschlägt):
   ```
   $body = JSONSetElement("{}"; "fm_vorgang_id";
             If($neuId = "" or Left($neuId;5) = "[MBS]"; "IM-" & $appId; $neuId); JSONString)
   PATCH /rest/v1/kontakt_historie?id=eq.<appId>
   ```
5. FM_23 (Änderungen) verarbeitet nur Einträge mit **echter** ID
   (`fm_vorgang_id=not.is.null&fm_vorgang_id=not.like.IM-*`) und aktualisiert per
   `WHERE "Vorgang_ID"=?`.

> Hinweis: Datumswerte beim INSERT/UPDATE als SQL-Literal `DATE 'JJJJ-MM-TT'`
> inline schreiben, nicht als Text-Parameter (sonst `FQL0013`).

---

## 8. Ein-Klick-Sammelskript + Server-Automatik (Phase C3)

### Sammelskript (Client, FM_99)
Statt acht Skripte einzeln: **ein** Skript, das alle Bausteine nacheinander ausführt.
Aufbau:
- Setzt die Zugangsdaten selbst (`$$SUPABASE_URL`, `$$SUPABASE_KEY`).
- Initialisiert `$bericht = ""`.
- Reihenfolge: **erst alle Rückwege, dann alle Hinwege** (das implementiert
  "App gewinnt", s. Abschnitt 6).
- Pro Baustein: dessen Schritte inline, aber den abschließenden `MBS("Msgbox")`
  durch ein Anhängen an `$bericht` ersetzen.
- Am Ende EIN `MBS("Msgbox"; $bericht)`.

Praktischer Build-Tipp: die fertigen Einzelskripte programmatisch einlesen und ihren
Msgbox-Schritt automatisch in eine `$bericht`-Zeile umschreiben – so bleibt die
getestete Logik unverändert.

### Server-Version (FM_98)
Identisch, aber **ohne Dialog** (Server kann keine anzeigen): den Abschluss-`Msgbox`
durch einen POST des Berichts nach `/rest/v1/sync_log` ersetzen:
```
$body = JSONSetElement("{}"; "bericht"; "AUTOMATISCHER SERVER-SYNC" & ¶ & $bericht; JSONString)
CURL POST /rest/v1/sync_log   (Header: apikey, Authorization Bearer, Content-Type application/json)
```

### Zeitplan im FileMaker Server
- Datei muss auf dem **Server gehostet** sein.
- **MBS-Plugin auf dem Server installieren UND aktivieren** (häufigste Fehlerquelle:
  Plugin nicht aktiv → geplantes Skript "läuft nicht").
- Admin Console → Skriptzeitpläne → Typ "FileMaker-Skript", Konto mit Vollzugriff,
  Skript FM_98, Intervall z. B. alle 5 Minuten. Server hat eigene Sitzung → löst das
  Sperr-Problem.
- Erst manuell vom Client testen (schreibt in `sync_log`), dann Zeitplan aktivieren.

---

## 9. Reihenfolge der Umsetzung (empfohlen)

1. Supabase-Tabellen + `fm_id`/`we_id` UNIQUE + Upsert-Constraints.
2. Hinwege (FM → App) für jede Tabelle, mit `IM_sync='x'`-Filter. Testen.
3. App: `app_modified_at` an allen Schreibstellen. `sync_state`-Merker anlegen.
4. Rückwege (App → FM), Filter auf `app_modified_at`, sperr-sichere Marker. Testen.
5. Spezialfall App-neu-Einträge (`IM_ID_merker`-Mechanik). Testen.
6. Sammelskript (Reihenfolge Rückweg→Hinweg) + Konflikt-Meldung. Testen.
7. Server-Version + `sync_log` + Zeitplan (MBS-Plugin am Server aktivieren!).

---

## 10. Erprobte Stolpersteine (Kurzliste)

- Rückweg auf `updated_at` statt `app_modified_at` filtern → Endlos-Echo.
- Skript "aktualisiert", aber alte Schritte nicht gelöscht → alte Logik bleibt aktiv.
- `IM_sync='x'` bleibt dauerhaft → bei jedem Lauf werden alle markierten Sätze neu
  übertragen (funktioniert, ist aber unnötig; optional nach erfolgreichem Sync
  entfernen oder zusätzlich auf FM-Änderungszeitstempel filtern).
- Datum als Text-Parameter in Datumsfeld → `FQL0013`; stattdessen `DATE '…'`-Literal.
- App-ID (Zahl) in FM-Textfeld → `FQL0013`; mit `GetAsText(...)` wandeln.
- `CURL.GetResultAsText` ohne `"UTF-8"` → Umlaute kaputt.
- Zeitstempel im URL-Filter nicht URL-kodiert → Filter greift nicht; mit
  `Text.EncodeToURL` kodieren.
- MBS-Server-Plugin nicht aktiviert → geplantes Skript scheint nicht zu starten.

---

## Kern in einem Satz

**Zwei Marker trennen die Quellen (`app_modified_at` für App-Änderungen,
`IM_sync='x'`+Zeitstempel für FM-Änderungen), die Reihenfolge Rückweg→Hinweg setzt
die Konfliktregel "App gewinnt", `sync_state`-Merker mit sperr-sicherer
Fortschreibung steuern "was ist neu", und ein dialogfreies Server-Skript mit
`sync_log` macht das Ganze automatisch.**
