# Beeskow

Kreisstadt im Landkreis Oder-Spree mit News, Veranstaltungen und Amtsblatt.
Quelle: https://www.beeskow.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.beeskow.de/aktuelles |
| Events    | https://www.beeskow.de/beeskow-erleben/veranstaltungen/ |
| Amtsblatt | https://www.beeskow.de/rathaus/aktuelles/amtsblaetter/ |

## Datenqualität

- **News:** 20 Einträge
- **Events:** 415 Einträge
- **Amtsblatt:** 119 Einträge

## Besonderheiten

- CMS: **ionas4**
- Events werden über eine JSON-API abgerufen (`/kalender/veranstaltungskalender/events.json`)
- Amtsblatt-Datum wird aus HTML-entity-codiertem JSON mit Timestamp gescrapt
- News im `news-index-item`-Format mit `<span class="headline">`
