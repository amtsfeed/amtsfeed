# Dallgow-Döberitz (Landkreis Havelland)

Amtsfreie Gemeinde im Landkreis Havelland, Brandenburg.

- **Website:** https://www.dallgow.de
- **CMS:** PortUNA (VerwaltungsPortal)
- **Identifikation:** `class="news-entry-to-limit"`, `class="row events-entry-3"`, `class="vorschau_text"`, PortUNA-gazette-tab Amtsblatt

## Datenquellen

| Kategorie | URL | Variante |
|-----------|-----|----------|
| News | `/news/1` | PortUNA `news-entry-to-limit` + `vorschau_text` (Datumsprefix `DD.MM.YYYY:`) |
| Events | `/veranstaltungen/index.php` | PortUNA `events-entry-3` (Datum via `<time datetime>`) |
| Amtsblatt | `/amtsblatt/index.php` | PortUNA `<article class="gazette-tab">` mit `<time datetime="YYYY-MM-DD">` + `gazette_{ID}`-Formular (POST-Download) |
| Bekanntmachungen | `/bekanntmachungen/index.php` | PortUNA `<td class="table-title">` + Title + PDF-Link |

## Besonderheiten

- Amtsblatt-PDFs liegen hinter einem POST-Formular (`form name="gazette_NNN"`). Es wird die Anker-URL `…#gazette_NNN` gespeichert; ein Direktdownload ist nicht möglich.
- Bekanntmachungen verweisen oft auf `daten.verwaltungsportal.de`-PDFs.

## Datenqualität

| Kategorie | Anzahl beim Erstabruf |
|-----------|-----------------------|
| News | 20 |
| Events | 31 |
| Amtsblatt | 109 |
| Bekanntmachungen | 90 |
