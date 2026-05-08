# Teltow

Stadt Teltow mit News, Veranstaltungen und Amtsblatt.
Quelle: https://www.teltow.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.teltow.de/news/index.php?rubrik=1 |
| Events    | https://www.teltow.de/veranstaltungen/index.php |
| Amtsblatt | https://www.teltow.de/amtsblatt/index.php |

## Datenqualität

- **News:** 20 Einträge
- **Events:** 103 Einträge
- **Amtsblatt:** 49 Einträge
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **Verwaltungsportal.de** mit gazette-tab-Amtsblatt-Format
- Amtsblatt-Parsing über `<article class="gazette-tab">` mit `<h3>Ausgabe Nr. N/YYYY</h3>` und `<time datetime="...">` sowie Gazette-ID für Direkt-Anker-URL
- Kein Bekanntmachungen-Scraper vorhanden
