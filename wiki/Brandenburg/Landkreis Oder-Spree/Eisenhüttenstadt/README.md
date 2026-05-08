# Eisenhüttenstadt

Stadt im Landkreis Oder-Spree mit News, Veranstaltungen und Amtsblatt über RSS-Feeds.
Quelle: https://www.eisenhuettenstadt.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.eisenhuettenstadt.de/media/rss/Pressemitteilungen.xml |
| Events    | https://www.eisenhuettenstadt.de/media/rss/Veranstaltungsueberblick.xml |
| Amtsblatt | https://www.eisenhuettenstadt.de/Rathaus/Aktuelles-Presse/Amtsblatt/ |

## Datenqualität

- **News:** 20 Einträge
- **Events:** 25 Einträge
- **Amtsblatt:** 10 Einträge

## Besonderheiten

- CMS: **Unbekannt (eigenes System)**
- Quellen werden als **ISO-8859-1 kodierte RSS-Feeds** abgerufen (kein HTML-Scraping)
- Event-Datum wird aus dem `<description>`-Feld des RSS geparst (`DD.MM.YYYY` Präfix)
- Amtsblatt-Links folgen dem Muster `/media/custom/NNNN_NNNN_1.PDF?TIMESTAMP`
