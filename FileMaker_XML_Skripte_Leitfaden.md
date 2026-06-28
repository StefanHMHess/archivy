# FileMaker-Skripte per XML erzeugen – Leitfaden

Lösung für das Problem, dass beim Erzeugen von `fmxmlsnippet`-XML falsche Step-IDs
entstehen und der Import in FileMaker kaputte Skripte produziert.

---

## 1. Das Problem

FileMaker-Skriptschritte haben in der XML eine numerische `id`. Rät man diese IDs,
entstehen beim Import falsche oder leere Schritte. Besonders Navigations- und
Feld-Schritte (Gehe zu Layout, Feldwert setzen, Datensatz anlegen …) haben IDs,
die man fast nie korrekt errät.

## 2. Lösung in zwei Teilen

### Teil 1 – Nur diese acht verifizierten Step-IDs verwenden

| Schritt                         | id  |
|---------------------------------|-----|
| Set Variable (Variable setzen)  | 141 |
| # (comment / Kommentar)         | 89  |
| If                              | 68  |
| Else                            | 69  |
| End If                          | 70  |
| Loop                            | 71  |
| Exit Loop If                    | 72  |
| End Loop                        | 73  |

Alles andere wird vermieden.

### Teil 2 – Arbeit über MBS-Funktionen in `Set Variable`, nicht über FileMaker-Schritte

Statt "Gehe zu Datensatz / Feldwert setzen / Datensatz anlegen" wird per
MBS-Plugin gelesen/geschrieben, jeweils in einem `Set Variable`-Schritt:

- **Lesen:** `MBS("FM.SQL.Execute"; ""; "SELECT …")` → Referenz, dann
  `MBS("FM.SQL.Text"; $ref; zeile; spalte)` oder
  `MBS("FM.SQL.JSONRecords"; $ref; feldliste)`; danach `MBS("FM.SQL.Release"; $ref)`.
- **Schreiben:** `MBS("FM.ExecuteFileSQL"; Get(FileName); "UPDATE/INSERT …"; 9; 13; $p1; $p2; …)`
  (9 = Tab-Trenner, 13 = Return-Trenner für das Ergebnis).
- **HTTP:** `MBS("CURL.New")`, `CURL.SetOptionURL`, `CURL.SetOptionHTTPHeader`,
  `CURL.SetOptionPostFields`, `CURL.Perform`, `CURL.GetResultAsText`, `CURL.Cleanup`.

Ablauflogik (Schleifen, Verzweigungen) ausschließlich mit If/Else/End If und
Loop/Exit Loop If/End Loop. So braucht man nie einen "gefährlichen" Schritttyp.

---

## 3. Die Dialog-Funktion (Meldungen anzeigen)

Es wird **kein** FileMaker-Schritt "Dialog anzeigen" (Show Custom Dialog) verwendet –
dessen Step-ID ist unsicher. Stattdessen wird der Dialog über eine **MBS-Funktion in
einem `Set Variable`-Schritt** ausgelöst:

```
Variable setzen [ $msg ; MBS("Msgbox"; "Titel/Zeile 1" & ¶ & "Zeile 2" & ¶ & "Zeile 3") ]
```

- `MBS("Msgbox"; text)` zeigt ein einfaches Meldungsfenster mit OK-Knopf.
- Mehrere Zeilen mit `& ¶ &` verketten (¶ = FileMaker-Zeilenumbruch).
- Der Rückgabewert landet in der Variablen (`$msg`) und wird nicht weiter gebraucht –
  es geht nur um die Anzeige.
- Eignet sich ideal für Status-/Ergebnis-Ausgaben am Ende eines Skripts
  (z. B. "HTTP-Status: " & $http & ¶ & "Gesendet: " & $anzahl).

### Wichtig: Dialoge funktionieren NICHT auf dem FileMaker Server

Server-seitig ausgeführte Skripte (geplante Skripte) können keine Dialoge anzeigen.
Für den Serverbetrieb die `MBS("Msgbox"; …)`-Zeile ersetzen durch ein **Protokoll**,
z. B. den Bericht per CURL in eine Log-Tabelle (in unserem Fall Supabase) schreiben:

```
Variable setzen [ $body ; JSONSetElement("{}"; "bericht"; $bericht; JSONString) ]
Variable setzen [ $c ; MBS("CURL.New") ]
Variable setzen [ $r ; MBS("CURL.SetOptionURL"; $c; $logurl) ]
Variable setzen [ $r ; MBS("CURL.SetOptionHTTPHeader"; $c; "apikey: " & $key;
                        "Authorization: Bearer " & $key; "Content-Type: application/json") ]
Variable setzen [ $r ; MBS("CURL.SetOptionPostFields"; $c; $body) ]
Variable setzen [ $r ; MBS("CURL.Perform"; $c) ]
Variable setzen [ $r ; MBS("CURL.Cleanup"; $c) ]
```

Faustregel: Für die **Client-Version** des Skripts `MBS("Msgbox")` am Ende; für die
**Server-Version** dieselbe Logik, aber den Bericht ins Protokoll schreiben statt
in einen Dialog.

---

## 4. XML-/Calc-Fallstricke (alle real aufgetreten)

- **`>` in Bedingungen:** In `<Calculation>` von If/Exit Loop If muss `>` roh im
  CDATA stehen (`$a > 0`), NICHT `&gt;`. Als `&gt;` wird es zu totem Kommentar
  `/* */` und die Bedingung ist leer.
- **Keine `<…>` in Kommentartexten:** z. B. `IM-<id>` im `<Text>` eines Kommentars
  wird als XML-Tag interpretiert → Import bricht ab. Stattdessen `IM-Nr` schreiben.
- **Komplexe `Substitute`-Verschachtelung** kann FileMaker dazu bringen, die GANZE
  Berechnung als Kommentar `/* */` zu behandeln (Ergebnis leer). Lösung: jede
  Berechnung einfach halten, jede Ersetzung in einen eigenen `Set Variable`-Schritt.
- **`FM.SQL.JSONRecords`-Feldliste:** muss EINE ¶-getrennte Liste sein
  (`"a" & ¶ & "b"`), keine Einzelparameter.
- **`RegEx.Replace`:** Ersetzungs-Gruppen mit `\1` (Backslash), nicht `$1`.
- **Umlaute beim Zurücklesen:** `MBS("CURL.GetResultAsText"; $c; "UTF-8")` – ohne
  `"UTF-8"` kommt Mojibake (`Ã¶` statt `ö`).
- **Umlaute beim Senden / URL:** Zeitstempel o. Ä. in Query-Filtern mit
  `MBS("Text.EncodeToURL"; $wert; "UTF-8")` kodieren.
- **Datum in Datumsfeld schreiben:** als SQL-Literal `DATE 'JJJJ-MM-TT'` inline,
  nicht als Text-Parameter (sonst `FQL0013 Incompatible types`).
- **Text vs. Zahl (`FQL0013`):** Textwert in Zahlenfeld (oder umgekehrt) → Fehler.
  JSON-Zahlen kommen aus `JSONGetElement` als Zahlentyp → für Textfelder mit
  `GetAsText(...)` wandeln; für Zahlenfelder ggf. `GetAsNumber(...)`.
- **Arithmetik auf Textfeld in FM-SQL** (`"IM_ID" * 1`) → `FQL0018 incompatible
  types`. Nicht für die Typumwandlung nutzen; stattdessen RegEx/GetAs… verwenden.
- **Leeres FM-Feld in SQL:** ist `NULL`, nicht `''`. Filter daher `IS NULL` /
  `IS NOT NULL`, nicht `<> ''`.
- **JSON-`null`:** `JSONGetElement` liefert für JSON-null den String `"null"` →
  vor dem Schreiben auf `""` abfangen.
- **Leere JSON-Werte für numerische Zielspalten:** `Substitute($json; ": \"\""; ": null")`,
  damit leere Strings als echte `null` ankommen.
- **`FM.ExecuteFileSQL` / `FM.SQL.Execute` geben Referenzen bzw. Ergebnisse zurück:**
  Referenz nach Gebrauch mit `FM.SQL.Release` freigeben.

---

## 5. Zuverlässiger Import-Weg (XML → FileMaker)

FileMaker importiert Skripte NICHT direkt aus einer XML-Datei. Bewährter Weg über
die Zwischenablage:

1. Einmalig ein Hilfsskript anlegen:
   ```
   Variable setzen [ $xml ; MBS("Clipboard.GetText") ]
   Variable setzen [ $r   ; MBS("Clipboard.SetFileMakerData"; "auto"; $xml) ]
   Dialog [ $r ]
   ```
2. XML-Datei in einem Texteditor öffnen → Alles markieren → Kopieren.
3. Hilfsskript ausführen (zeigt "OK").
4. Im Skript-Arbeitsbereich in die **Skriptliste** klicken → Einfügen → Skript erscheint.

**Beim Aktualisieren:** Ein bestehendes Skript wird beim Einfügen NICHT automatisch
ersetzt. Vorher die alten Schritte komplett markieren und löschen – oder das ganze
Skript löschen und neu anlegen. Sonst bleibt die alte Logik aktiv (häufige
Fehlerquelle: "Änderung wirkt nicht").

---

## 6. Empfehlung für die XML-Erzeugung

Die Skripte programmatisch aus einem **Builder** erzeugen, der nur die acht
Schritttypen über kleine Hilfsfunktionen ausgibt. Beispiel (Python):

```python
def sv(name, calc):   # Set Variable
    return ('<Step enable="True" id="141" name="Set Variable">\n'
            '<Value><Calculation><![CDATA[' + calc + ']]></Calculation></Value>\n'
            '<Repetition><Calculation><![CDATA[1]]></Calculation></Repetition>\n'
            '<Name>' + name + '</Name>\n</Step>')

def comment(t):       # # (comment)
    return '<Step enable="True" id="89" name="# (comment)"><Text>' + t + '</Text></Step>'

def if_s(cond):       # If
    return '<Step enable="True" id="68" name="If">\n<Calculation><![CDATA[' + cond + ']]></Calculation>\n</Step>'
def else_s():  return '<Step enable="True" id="69" name="Else"></Step>'
def endif_s(): return '<Step enable="True" id="70" name="End If"></Step>'
def loop_s():  return '<Step enable="True" id="71" name="Loop"></Step>'
def exitloop_s(cond):
    return '<Step enable="True" id="72" name="Exit Loop If">\n<Calculation><![CDATA[' + cond + ']]></Calculation>\n</Step>'
def endloop_s(): return '<Step enable="True" id="73" name="End Loop"></Step>'

# Gerüst:  <fmxmlsnippet type="FMObjectList"> … Schritte … </fmxmlsnippet>
```

### Nach dem Erzeugen jede Datei prüfen
1. Mit einem XML-Parser validieren (wohlgeformt?).
2. Sicherstellen, dass die Menge der vorkommenden IDs eine Teilmenge ist von
   `{141, 89, 68, 69, 70, 71, 72, 73}`:
   ```python
   import re
   ids = set(re.findall(r'id="(\d+)"', xml))
   assert ids <= {"141","89","68","69","70","71","72","73"}
   ```

---

## Kern in einem Satz

**Nur acht verifizierte Schritttypen verwenden und alle Lese-/Schreib-/HTTP-/Dialog-
Operationen über MBS-Funktionen in `Set Variable` abwickeln (Dialog =
`MBS("Msgbox"; …)`, serverseitig stattdessen ins Protokoll schreiben), statt
FileMaker-Schritte mit unsicheren IDs zu raten.**
