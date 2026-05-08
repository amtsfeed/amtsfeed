# Amt Plessa

Amt im Landkreis Elbe-Elster, Brandenburg.
Quelle: https://www.plessa.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.plessa.de/news/1 |
| Events           | https://www.plessa.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.plessa.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.plessa.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus `news-entry-new-3-date`-Block im Format „07. Mai 2026"
- **Events:** 31 Einträge, Datum aus URL `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/`
- **Amtsblatt:** 277 Einträge, Datum aus `<time datetime="YYYY-MM-DD">` innerhalb `<article class="gazette">`
- **Bekanntmachungen:** 2 Einträge, Datum aus `<td class="table-title">DD.MM.YYYY</td>`

## Besonderheiten

- CMS: **PortUNA**
- News-Datum als ausgeschriebener Monatsname (dt.), wird per Lookup-Tabelle übersetzt
