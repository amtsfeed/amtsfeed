# Amt Schradenland

Amt im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.amt-schradenland.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.amt-schradenland.de/news/1 |
| Events | https://www.amt-schradenland.de/veranstaltungen/index.php |

## Datenqualität

- **News:** 4 Einträge, Datum aus `<p class="vorschau_text">DD.MM.YYYY: ...</p>`
- **Events:** 83 Einträge, Datum aus `<time class="events-entry-3-time" datetime="YYYY-MM-DD">`
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **PortUNA**
- Events nutzen Layout `events-entry-3-time-wrapper`; ID aus URL-Segment `/veranstaltungen/{ID}/`
- News-Sortierung nach numerischer ID (absteigend)
