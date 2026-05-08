# Verbandsgemeinde Bad Liebenwerda

Verbandsgemeinde im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.verbandsgemeinde-liebenwerda.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.verbandsgemeinde-liebenwerda.de/news/index.php?rubrik=1 |
| Events           | https://www.verbandsgemeinde-liebenwerda.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.verbandsgemeinde-liebenwerda.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.verbandsgemeinde-liebenwerda.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus `<p class="vorschau">DD.MM.YYYY: ...</p>`
- **Events:** 101 Einträge, Datum aus URL `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/`
- **Amtsblatt:** 334 Einträge, Datum aus `<td>DD.MM.YYYY</td>` neben `<td>Nr. X/YYYY</td>`
- **Bekanntmachungen:** 14 Einträge, Datum aus `<td valign="top">DD.MM.YYYY</td>`

## Besonderheiten

- CMS: **PortUNA**
- News-Endpoint nutzt Rubrik-Parameter `?rubrik=1`
- Amtsblatt ohne direkte PDF-Links; URL verweist auf Übersichtsseite
- Bekanntmachungen: Fallback-Pattern `valign="top"` zusätzlich zu `class="table-title"`
