# Web-App-Entwicklung (React + Supabase) – Leitfaden

Steckbrief und erprobte Konventionen für den Bau einer Web-App wie "ImmoManager"
(Verwaltung von Kontakten, Objekten, Verlauf). Gedacht zum Weitergeben an einen
neuen Chat / ein neues Projekt (z. B. Archivy).

---

## 1. Technologie-Stack

- **Frontend:** React mit **Vite** (schneller Dev-Server, Build-Tool)
- **Sprache:** JavaScript/JSX (kein TypeScript im Referenzprojekt)
- **Styling:** Inline-Styles über ein zentrales Token-Objekt `T`
  (Farben, Abstände) – kein externes CSS-Framework nötig
- **Backend:** **Supabase** = PostgreSQL + auto-generierte REST-API (PostgREST)
  + Auth + Storage
- **Hosting:** **Netlify** (automatischer Build bei git push)
- **Lokale Entwicklung:** `npm run dev` → `localhost:5173`

---

## 2. Projekt-/Deploy-Ablauf

- Quellcode liegt in `src/` (einzelne `.jsx`-Dateien je Bereich).
- Lokal testen mit `npm run dev` (spart Hosting-Ressourcen, sofortiges Neuladen).
- Deploy: geänderte Dateien in `src/` ablegen →
  `git add . && git commit -m "…" && git push` → Netlify baut & veröffentlicht
  automatisch.
- Live-URL-Schema: `<projektname>.netlify.app`.

---

## 3. Supabase anbinden

```js
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = "https://<projekt>.supabase.co";
const SUPABASE_ANON_KEY = "<anon-key>";          // öffentlich, nur Lese-/Schreibrechte gem. RLS
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- **anon-Key** ins Frontend (eingeschränkt durch Row Level Security).
- **service_role-Key** NIE ins Frontend – nur serverseitig (bei uns: in FileMaker).
- CRUD über die Client-Bibliothek:
  ```js
  const { data, error } = await supabase.from("kontakte").select("*").order("nachname");
  await supabase.from("kontakte").insert([{ … }]);
  await supabase.from("kontakte").update({ … }).eq("id", id);
  await supabase.from("kontakte").delete().eq("id", id);
  ```
- Verknüpfte Daten über Fremdschlüssel laden (PostgREST-Embeds):
  ```js
  supabase.from("kontakte").select("*, kontakt_historie(*)")
  ```
- **Reihenfolge beim Löschen** beachten: abhängige Zeilen (Historie,
  N:M-Verknüpfungen) zuerst löschen, dann den Hauptdatensatz – sonst
  Fremdschlüssel-Fehler.

---

## 4. Datenmodell-Muster

- Jede Tabelle: `id` BIGSERIAL PK, `created_at TIMESTAMPTZ DEFAULT now()`,
  fachliche Felder.
- **N:M-Beziehungen** über eine Zwischentabelle
  (z. B. `objekt_interessenten(objekt_id, kontakt_id)`).
- **Historien-/Log-Tabelle** mit Fremdschlüssel auf den Hauptdatensatz
  (z. B. `kontakt_historie.kontakt_id`).
- Row Level Security (RLS) aktivieren; für den Anfang eine Allow-all-Policy,
  später feiner.

---

## 5. React-Konventionen & wichtige Stolpersteine

### Formular-Komponenten AUSSERHALB der Hauptkomponente definieren
Der wichtigste erprobte Stolperstein: Wird ein Formular (oder eine
Eingabefeld-Gruppe) **innerhalb** der Render-Funktion der Elternkomponente
definiert, wird es bei jedem Tastendruck neu erzeugt → das Eingabefeld
**verliert den Fokus** nach jedem Zeichen.
→ Lösung: solche Komponenten auf Modulebene (außerhalb) definieren und Werte/Handler
per Props übergeben.

### State statt Browser-Storage
- Daten im Komponenten-State halten (`useState`, `useReducer`).
- **Kein `localStorage`/`sessionStorage`** (in eingebetteten/Artefakt-Umgebungen
  nicht zuverlässig). Persistenz läuft über Supabase.

### Weitere Muster
- Zentrales `T`-Objekt für Design-Tokens (Farben, Radius, Abstände) → konsistentes
  Aussehen, leicht anpassbar.
- Status-Werte über farbige Badges visualisieren (Mapping Status → Farbe).
- Navigation mit Filter-Reset: beim Wechsel der Ansicht ggf. gesetzte Filter
  zurücksetzen, damit nicht unbeabsichtigt leere Listen erscheinen.
- Listen: sticky Kopf-/Filterleiste (`position: sticky; top: 0`), optionale
  A–Z-Sprungleiste über Anker-IDs am ersten Element je Buchstabe und
  `scrollIntoView`. Bei sticky Kopf den Sprungzielen `scrollMarginTop` geben,
  damit sie nicht unter dem Kopf verschwinden.

---

## 6. Zahlen, Datum, Formatierung (deutsch)

- Geldbeträge/Flächen mit `toLocaleString("de-DE", { … })` formatieren
  (Tausenderpunkt, Dezimalkomma).
- Beim Speichern leere Felder gezielt auf `null` setzen statt `""`
  (saubere Datentypen in der DB):
  ```js
  const num = (v) => v === "" || v == null ? null : +v;
  ```
- Datum: in der DB als `date`/`timestamptz`; aus ISO-String anzeigen, beim Schreiben
  ISO senden (`new Date().toISOString()`).
- Read-only-Felder (z. B. ein extern verwalteter Preis) im Formular ausgrauen und
  nicht ins Schreib-Payload aufnehmen bzw. nicht zurücksyncen.

---

## 7. Export / Dokumente

- CSV-/Excel-Export im Browser über SheetJS (xlsx); für deutsches Excel
  Semikolon als Trennzeichen verwenden.
- PDF-Erzeugung (z. B. Exposés) clientseitig möglich.

---

## 8. Arbeitsweise (bewährt)

- **Sprache:** durchgängig Deutsch.
- **Iterativ:** vollständige Datei/Code liefern → lokal testen → konkrete
  Rückmeldung/Fehlertext → gezielter Fix. Kleine, überprüfbare Schritte.
- Komplexe, wiederholbare Artefakte (z. B. generierte Skripte) über kleine
  Builder-Skripte erzeugen statt von Hand – reproduzierbar und fehlerärmer.
- Nach jeder Änderung Datei vollständig bereitstellen, alte gleichnamige
  überschreiben.

---

## 9. Optionale Kopplung an FileMaker

Wenn die App Daten mit einer FileMaker-Datenbank austauschen soll, gibt es zwei
separate Leitfäden:
- **FileMaker_XML_Skripte_Leitfaden.md** – wie man FileMaker-Skripte sicher per
  XML erzeugt (acht sichere Step-IDs, alles über MBS in `Set Variable`,
  Dialog-Funktion, Import-Weg).
- **Bidirektionaler_Sync_Leitfaden.md** – kompletter automatischer Zwei-Wege-Sync
  (Echo-Vermeidung über `app_modified_at`, Konfliktregel, Server-Automatik).

Für die App-Seite des Syncs gilt: bei JEDEM schreibenden Vorgang zusätzlich
`app_modified_at: new Date().toISOString()` mitsenden (Insert wie Update, an allen
Schreibstellen). Das ist die Grundlage der Echo-Vermeidung im Sync.

---

## Kern in einem Satz

**React (Vite) + Supabase + Netlify; Formular-Komponenten außerhalb der
Elternkomponente halten (Fokus-Falle), Persistenz ausschließlich über Supabase
(kein Browser-Storage), deutsche Formatierung und `null` statt `""`, iterativ mit
lokalem `npm run dev` entwickeln – und für FileMaker-Kopplung an allen Schreibstellen
`app_modified_at` mitsenden.**
