# Herzberg (Elster)

Stadt im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.herzberg-elster.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.herzberg-elster.de/news/1 |
| Events | https://www.herzberg-elster.de/veranstaltungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus `<p class="vorschau_text">DD.MM.YYYY: ...</p>`
- **Events:** 32 Einträge, Datum aus URL `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/`, optional Uhrzeit aus `event-entry-new-2-daytime`
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **PortUNA**
- Events nutzen Layout `event-entry-new-2`; ID aus URL-Segment
- News-Sortierung nach numerischer ID (absteigend)
