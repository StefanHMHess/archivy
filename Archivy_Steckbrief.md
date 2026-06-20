# Archivy – Projekt-Steckbrief

Vertrags- und Dokumentenverwaltung für Wohnbau Hess GmbH. Plattformübergreifend (Web + Mobil), mit bidirektionaler FileMaker-Synchronisation. Aufgebaut im gleichen Stil wie ImmoManager.

---

## 1. Architektur / Stack

- **Frontend:** React mit Vite, Deploy auf Netlify
- **Lokale Entwicklung:** `npm run dev` auf `localhost:5173`
- **Backend:** Supabase (PostgreSQL + auto-generierte REST-API über PostgREST)
- **Deploy-Workflow:** Dateien in `src/` kopieren → `git add . / commit / push` → Netlify baut automatisch
- **Sprache:** Alles auf Deutsch
- **Arbeitsweise:** Iterativ – vollständigen Code/Skript liefern → lokal testen → Ergebnis/Fehler melden → Fix

## 2. Supabase

- Zugriff per REST-API (`/rest/v1/<tabelle>`)
- Zwei Schlüssel: `anon` (in der App, öffentlich) und `service_role` (geheim, nur serverseitig / in FileMaker)
- Row Level Security (RLS) aktiv; `service_role` umgeht sie
- Upsert über `on_conflict=<spalte>` + Header `Prefer: resolution=merge-duplicates`
- **Storage:** PDFs liegen als echte Dateien im Supabase Storage (NICHT als Base64/Binär in der DB). In der Tabelle steht nur der Storage-Pfad/Verweis.

## 3. Frontend-Konventionen

- Komponenten als einzelne `.jsx`-Dateien (App, Dashboard, Vorgänge, Verträge, Dokumente, Kontakte usw.)
- Zentrale Design-Tokens (Farben, Abstände) in einem `T`-Objekt
- **Design-Tokens Archivy:** Teal-Farbwelt — Primär `#0f766e`, Akzent hell `#14b8a6`, Flächen `#0d9488`, Text-auf-Teal `#f0fdfa`
- Formulare als Komponenten AUSSERHALB der Hauptkomponente definieren (sonst verliert das Eingabefeld bei jedem Tastendruck den Fokus)
- Kein `localStorage`/`sessionStorage` in Artefakten
- **PDF-Anzeige** ist Top-Priorität: mobil flüssig, einmal geöffnete PDFs offline verfügbar (Cache)

## 4. Datenmodell (aus FileMaker-DDR abgeleitet)

Die Hauptdaten liegen in **Vorgänge** – dort hängen auch alle PDFs.

### Tabelle: vorgaenge (Herzstück, ~58 Felder in FM)
Schlüssel `vorgang_id`. Wichtige Felder:
- Verknüpfungen: `bvh` (Bauvorhaben), `ba`, `gew` (Gewerk), `an`, `a_nr`, `kunde`, `we` (Wohneinheit), `grundstueck`, `makler`, `vertrag`, `interessent`
- Inhalt: `vorgang_art`, `kurzbeschreibung`, `beschreibung`
- Dateien: PDF/Foto → in Supabase Storage, DB hält `datei_pfad`, `foto_pfad`
- Fristen: `datum`, `frist`, `erledigung`, `nachfrist`, `erledigt`
- Zuständigkeit: `ersteller`, `verantwortlicher`, `sb`
- Sync: `app_modified_at`, `sync_state`, `erstellt`, `geaendert`

### Tabelle: vertraege (~62 Felder in FM)
Schlüssel `vertrag_id`. Felder u.a.: `gruppe`, `untergruppe`, `firma`, `beschreibung`, `vertragsnummer`, `kontakt`, Bankdaten (`iban`, `bic`, `bank`), Kosten (`kosten_pro_rate`, `kosten_monatlich`, `kosten_jaehrlich`, `zahlungsweise`), Laufzeit (`vertrags_datum`, `vertrags_beginn`, `vertrags_ablauf`), PDFs → Storage-Pfade, `dauerzahlung_id`.

### Tabelle: dokumente (~23 Felder in FM)
Schlüssel `dokument_id`, `adresse_id`, `nachname`, `datum`, `eingang`, `sache`, `schlagworte`, `status`, PDF/JPG → Storage.

### Tabelle: adressen (Stammdaten, in FM doppelt: Wohnbau 82 / Dokumente 76 Felder)
Schlüssel `adresse_id`. Name, Anschrift, Kontaktdaten, Rollen-Flags (`an`, `bieter`, `kunde`, `notar`, `makler` …), `iban`.

### Konventionen
- Jede Haupttabelle: `id` (BIGSERIAL), `created_at`, fachliche Felder + die fachliche FM-ID als eigene Spalte (für Sync-Mapping)
- N:M-Verknüpfungen über Zwischentabelle
- Historien-/Log-Tabelle mit Fremdschlüssel auf den Hauptdatensatz

## 5. FileMaker-Synchronisation (bidirektional, beide Seiten gleichberechtigt)

FileMaker bleibt voll im Einsatz. Quelldateien: `Wohnbau.fmp12` (Vorgänge, Adressen) und `Dokumente.fmp12` (Verträge, Dokumente). Beide nutzen bereits ein `sync`-Zeitstempelfeld.

- **MBS-Plugin** für die HTTP-Calls aus FileMaker an die Supabase-REST-API
- **Skript-Import-Methode:** Sync-Skripte werden per definierter Methode importiert (sichere Schritt-IDs verwenden, damit FileMaker die Skriptschritte korrekt auflöst)
- **Sync-Felder auf beiden Seiten:** `app_modified_at` (Zeitstempel der letzten App-Änderung) und `sync_state` (z.B. neu / geändert / synchronisiert)
- **Richtung FM → Supabase:** geänderte Datensätze (per `sync`-Zeitstempel) per Upsert (`on_conflict` auf die fachliche ID, `Prefer: resolution=merge-duplicates`)
- **Richtung Supabase → FM:** App-Änderungen (`sync_state` = geändert) zurückschreiben
- **Konfliktauflösung:** neuester Zeitstempel gewinnt; bei Bedarf feldweises Mergen mit Markierung
- **PDFs:** Binär-/Container-Inhalt aus FileMaker einmalig in Supabase Storage hochladen, danach nur noch Pfad-Referenz synchronisieren

## 6. Prioritäten (vom Auftraggeber)

1. PDF-Zugriff & Anzeige
2. Mobil voll nutzbar (iOS/Android)
3. Schnelle Suche
4. Offline-Fähigkeit

## 7. Branding

- **Name:** Archivy
- **Logo/Icon:** Ordner-Symbol mit „A" (Querstrich des A liegt auf der Deckellinie), Teal-Farbwelt. SVG-Dateien vorhanden.

---

## Was dem neuen Chat zu Beginn mitgeben

1. Diesen Steckbrief komplett
2. Die SVG-Dateien (Logo + Icon) fürs Branding
3. Den FileMaker-DDR (Tabellen `vorgaenge`, `vertraege`, `dokumente`, `adressen`) bei Bedarf für Detailfelder
4. Hinweis: zuerst Supabase-Schema (SQL) erstellen lassen, dann React-Grundgerüst, dann Sync-Skripte
