# Elsterwerda

Stadt im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.elsterwerda.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.elsterwerda.de/wp-json/wp/v2/posts?per_page=50&_fields=id,date,title,link,excerpt |
| Events | https://www.elsterwerda.de/wp-json/tribe/events/v1/events?per_page=50 |

## Datenqualität

- **News:** 50 Einträge, Datum aus WP-REST-Feld `date` (ISO-Format)
- **Events:** 50 Einträge, Datum aus Tribe-Events-REST-Feld `start_date`
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **WordPress** mit Plugin **The Events Calendar** (Tribe Events)
- Beide Datenquellen sind REST-APIs; kein HTML-Scraping
- ID direkt aus WordPress-Post-ID bzw. Event-ID
