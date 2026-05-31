# Milower Land (Landkreis Havelland)

Amtsfreie Gemeinde im Landkreis Havelland, Brandenburg.

- **Website:** https://www.milow.de (nicht `milower-land.de` — die Domain ist geparkt und leitet auf einen Getränkehändler weiter)
- **CMS:** PortUNA (VerwaltungsPortal)
- **Identifikation:** `class="news-entry-to-limit"`, `class="event-entry-new-1"`, Tabellen-Amtsblatt mit `gazette_{ID}`

## Datenquellen

| Kategorie | URL | Variante |
|-----------|-----|----------|
| News | `/news/1` | PortUNA `news-entry-to-limit` |
| Events | `/veranstaltungen/index.php` | PortUNA `event-entry-new-1` (Datum aus URL `/veranstaltungen/ID/YYYY/MM/DD/slug.html`) |
| Amtsblatt | `/amtsblatt/index.php` | Tabelle `<td>Nr. N/YYYY</td><td>Datum</td><td><form gazette_ID></td>` |
| Bekanntmachungen | `/bekanntmachungen/index.php` | PortUNA `<td class="table-title">` |
| Bekanntmachungen (RatsInfo / ALLRIS net) | https://ratsinfo-online.net/milowerland-bi/do011_x.asp | Tabellenzeilen mit `DOLFDNR`-Form (PDF) + Sitzungsdatum + Sitzungstitel; ISO-8859-1; PDF via `do027.asp?DOLFDNR=...&options=64` (Redirect → PDF) |

## Besonderheiten

- Domain `milower-land.de` ist eine geparkte Drittseite — die Gemeinde verwendet ausschließlich `milow.de` (Sitz im Ortsteil Milow).
- Das Amtsblatt-Archiv zeigt im HTML nur das aktuell aufgeklappte Jahr (alle anderen Jahre werden per JS nachgeladen) — daher nur 1 Eintrag verfügbar; Historie kann durch Aufruf einzelner Jahresseiten ergänzt werden (TODO).
- Bekanntmachungen verweisen direkt auf `daten.verwaltungsportal.de`-PDFs.

## Datenqualität

| Kategorie | Anzahl beim Erstabruf |
|-----------|-----------------------|
| News | 20 |
| Events | 11 |
| Amtsblatt | 1 (nur aktuell aufgeklapptes Jahr) |
| Bekanntmachungen | 48 (15 PortUNA + 33 ALLRIS-Sitzungsbekanntmachungen) |
