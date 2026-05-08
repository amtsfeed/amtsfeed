# Sonnewalde

Stadt im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.stadt-sonnewalde.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.stadt-sonnewalde.de/news/1 |
| Events | https://www.stadt-sonnewalde.de/veranstaltungen/index.php |

## Datenqualität

- **News:** 5 Einträge, kein Datum verfügbar (PortUNA liefert hier kein Datum im Listing)
- **Events:** 19 Einträge, Datum aus URL `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/`, optional Uhrzeit aus `event-time`-Block
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **PortUNA**
- Domain: www.sonnewalde.de leitet weiter auf **www.stadt-sonnewalde.de**
- Events nutzen klassisches `event-box`-Layout; Zeit aus `<time>HH:MM</time>`-Tags
- News-Sortierung nach numerischer ID (absteigend); `publishedAt` ist immer `null`
