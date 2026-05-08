# Doberlug-Kirchhain

Stadt im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.doberlug-kirchhain.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.doberlug-kirchhain.de/news/1 |
| Events | https://www.doberlug-kirchhain.de/veranstaltungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus `<p class="vorschau_text">DD.MM.YYYY: ...</p>`
- **Events:** 65 Einträge, Datum aus URL `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/`, optional Uhrzeit aus `event-entry-new-1-daytime`
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **PortUNA**
- Events nutzen Layout `event-entry-new-1`; ID aus URL-Segment
- News-Sortierung nach numerischer ID (absteigend)
