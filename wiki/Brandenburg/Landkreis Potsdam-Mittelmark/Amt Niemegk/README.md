# Amt Niemegk

Gemeindeverwaltung des Amtes Niemegk mit News, Veranstaltungen (RSS), Amtsblatt und Bekanntmachungen.
Quelle: https://amt-niemegk.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://amt-niemegk.de/nachrichten-aus-dem-amtsgebiet/ |
| Events           | https://amt-niemegk.de/events/feed/ |
| Amtsblatt        | https://amt-niemegk.de/amtsblatt/ |
| Bekanntmachungen | https://amt-niemegk.de/bekanntmachungen/ |

## Datenqualität

- **News:** 1 Eintrag
- **Events:** 4 Einträge
- **Amtsblatt:** 195 Einträge
- **Bekanntmachungen:** 25 Einträge

## Besonderheiten

- CMS: **WordPress** mit MEC (Modern Events Calendar) Plugin
- Events werden aus dem MEC-RSS-Feed bezogen (bis zu 10 Seiten paginiert), Format: `mec:startDate`, `mec:location`
- Amtsblatt: PDF-Links im Format `YYYY – NN – Amtsblatt`
- Bekanntmachungen: WordPress Gutenberg Columns-Layout mit Accordion nach Jahren, PDFs aus 50%/25%-Spalten
