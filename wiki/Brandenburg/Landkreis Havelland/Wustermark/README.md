# Wustermark (Landkreis Havelland)

Amtsfreie Gemeinde im Landkreis Havelland, Brandenburg.

- **Website:** https://www.wustermark.de
- **CMS:** IKISS / Advantic (Layout-Kürzel `wustermark_2025`)
- **Encoding:** `windows-1252` (ISO-8859-15) — Antworten werden mit `TextDecoder("windows-1252")` dekodiert
- **Identifikation:** `<meta name="designer" content="Advantic GmbH">`, `data-ikiss-mfid="…"`, `<generator>IKISS</generator>` im RSS-Feed

## Datenquellen

| Kategorie | URL | Variante |
|-----------|-----|----------|
| News | `/media/rss/Meldungen_aus_Wustermark.xml` | RSS-Feed (windows-1252), FID `3847.NNNNN.1` aus Link |
| Events | `/Verwaltung-Politik/Allgemeines/Veranstaltungen/` | IKISS `result-list_object` mit `data-ikiss-mfid="11.3847.{ID}.1"` + `<time datetime>` |
| Amtsblatt | `/Verwaltung-Politik/Allgemeines/Amtsblatt/` | Accordion mit `/loadDocument.phtml?FID=3847.{ID}.1&Ext=PDF`-Links, Titel `Amtsblatt N der Gemeinde Wustermark aus YYYY` |
| Bekanntmachungen | `/Verwaltung-Politik/Allgemeines/öffentliche-Bekanntmachungen/` | IKISS `result-list_object` mit `data-ikiss-mfid="6.3847.{ID}.1"` |

## Besonderheiten

- RSS-Feed liefert die zuverlässigsten Daten für News (inkl. `pubDate`); HTML-Listing wird daher nicht zusätzlich gescraped.
- Amtsblatt-Liste hat **kein konkretes Erscheinungsdatum** im HTML — der Scraper nutzt `YYYY-01-01` als `publishedAt` (sortierbar nach Jahr+Nummer). Titel-Format: `Amtsblatt Nr. NN/YYYY`.
- Bekanntmachungen-Liste hat **kein Datum** im HTML — `publishedAt` ist der Abrufzeitpunkt; die ID `wustermark-notice-{FID}` ist stabil, das Datum bleibt beim Re-Run erhalten (Erstabruf = Erstsichtung).

## Datenqualität

| Kategorie | Anzahl beim Erstabruf |
|-----------|-----------------------|
| News | 7 |
| Events | 25 |
| Amtsblatt | 8 |
| Bekanntmachungen | 7 |
