# Schönefeld

Gemeinde im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://gemeinde-schoenefeld.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.schoenefeld.de/news/ |
| Events    | https://www.schoenefeld.de/mein-schoenefeld/veranstaltungen/ |
| Amtsblatt | https://www.schoenefeld.de/presse/amtsblatt/ |

## Datenqualität

- **News:** 12 Einträge, Datum aus `<div class="news-list-inner--date">DD.MM.YY</div>`
- **Events:** 344 Einträge, Datum aus `<div class="veranstaltung-list-inner--date col-2">DD.MM.YY</div>`
- **Amtsblatt:** 178 Einträge, Datum aus Upload-Pfad (`/wp-content/uploads/YYYY/MM/Amtsblatt-YYYY_NN.pdf`) oder Legacy-Pfad

## Besonderheiten

- CMS: **WordPress** (Custom-Theme `pn-gemeinde-schoenefeld-theme`, kein wp-json-API-Endpoint)
- Scraping erfolgt per HTML-Parsing statt REST API
- Einstieg via HTTP (`http://www.schoenefeld.de`) wegen TLS-Redirect-Eigenheiten; kanonische URLs sind `https://gemeinde-schoenefeld.de/`
- News-Seite mit bis zu 3 Retries bei HTTP 504 Gateway Timeout
- Amtsblatt: zwei Formate — moderne WP-Uploads (`Amtsblatt-YYYY_NN.pdf`) und Legacy-tl_files (`Amtsblatt%20NN-YY.pdf`)
- Event-Datum als DD.MM.YY (zweistelliges Jahr), wird als 20YY interpretiert
