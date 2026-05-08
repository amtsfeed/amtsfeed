# Lübben (Spreewald)

Kreisstadt im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.luebben.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.luebben.de/stadt-luebben/de/buergerservice/aktuelles/ |
| Amtsblatt | https://www.luebben.de/stadt-luebben/de/buergerservice/stadtanzeiger-amtsblatt/ |

## Datenqualität

- **News:** 360 Einträge, Datum aus `<time datetime="...">` innerhalb von `class="news-index-item"`-Containern
- **Amtsblatt:** 82 Einträge, Datum und Nummer aus PDF-Dateinamen (`YYYY-MM-amtsblatt-et-DD.MM.YY.pdf`)
- **Events:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **ionas4**
- News: server-gerenderter HTML-Teaser mit `class="news-index-item"`, Datum aus `<time datetime="ISO">` und Titel aus `<span class="headline">`
- Amtsblatt: PDFs mit relativem Pfad `amtsblaetter/YYYY/YYYY-MM-amtsblatt*.pdf`, Basis: `/stadt-luebben/de/`
- Amtsblatt-Nummer wird aus dem Monat des Dateinamens abgeleitet (kein separates Nr.-Feld)
- Website-Meta enthält `noai, noindex` für KI-Crawler; robots.txt erlaubt amtsfeed-UA
