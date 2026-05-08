# Eichwalde

Gemeinde im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.eichwalde.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.eichwalde.de/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc |
| Events    | https://www.eichwalde.de/wp-json/tribe/events/v1/events?per_page=50&status=publish |
| Amtsblatt | https://www.eichwalde.de/buergerservice/amtsblaetter/ |

## Datenqualität

- **News:** 100 Einträge, Datum aus `date`-Feld der WP REST API (ISO-Format)
- **Events:** 13 Einträge, Datum aus `start_date`/`end_date` der The Events Calendar (tribe/events/v1) API
- **Amtsblatt:** 68 Einträge, Datum aus HTML-Span `<span class="kt-svg-icon-list-text">Amtsblatt YYYY NN (DD.MM.YYYY)</span>` nach dem PDF-Link

## Besonderheiten

- CMS: **WordPress** (wp-json REST API)
- Events über The Events Calendar Plugin (`tribe/events/v1`-Endpoint), bis zu 3 Seiten paginiert
- Amtsblatt-PDFs unter `/wp-content/uploads/`, Muster: `Amtsblatt-YYYY_NN.pdf`
- News bis zu 3 Seiten à 50 Einträge paginiert
