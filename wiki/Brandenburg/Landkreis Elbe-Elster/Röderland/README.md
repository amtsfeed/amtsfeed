# Röderland

Gemeinde im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.gemeinde-roederland.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.gemeinde-roederland.de/news/1 |
| Events | https://www.gemeinde-roederland.de/veranstaltungen/index.php |

## Datenqualität

- **News:** 50 Einträge, Datum aus `<p class="vorschau_text">DD.MM.YYYY: ...</p>`
- **Events:** 38 Einträge, Datum aus URL `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/`, optional Uhrzeit aus `event-entry-new-1-daytime`
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **PortUNA**
- Events nutzen Layout `event-entry-new-1`; ID aus URL-Segment
- News-Sortierung nach numerischer ID (absteigend)
