# Wildau

Stadt im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.wildau.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.wildau.de/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc |
| Amtsblatt | https://www.wildau.de/stadt/rathaus-online/amtsblatt/ |

## Datenqualität

- **News:** 150 Einträge, Datum aus `date`-Feld der WP REST API (ISO-Format), bis zu 3 Seiten à 50
- **Amtsblatt:** 10 Einträge, Datum aus Button-Text `Ausgabe N vom DD.MM.YYYY` neben dem PDF-Link
- **Events:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **WordPress** (wp-json REST API)
- Amtsblatt-PDFs unter `/wp-content/uploads/`; Ausgabenummer und Datum aus umgebenden `<a class="gb-button">`-Element mit Text "Ausgabe N vom DD.MM.YYYY"
- News: bis zu 3 Seiten paginiert
