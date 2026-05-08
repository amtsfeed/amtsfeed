# Amt Schenkenländchen

Amt im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.amt-schenkenlaendchen.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.amt-schenkenlaendchen.de/news/index.php?rubrik=1 |
| Events           | https://www.amt-schenkenlaendchen.de/veranstaltungen |
| Amtsblatt        | https://www.amt-schenkenlaendchen.de/amtsblatt/index.php?ebene=28 |
| Bekanntmachungen | https://www.amt-schenkenlaendchen.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus `<div class="news-entry-new-2-date">` (DD. Monat YYYY oder DD.MM.YYYY)
- **Events:** 245 Einträge, Datum aus URL-Muster `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`
- **Amtsblatt:** 662 Einträge, Datum aus Tabellenzeile `<td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>`; PDFs via POST-Formular (gazette_ID)
- **Bekanntmachungen:** 0 Einträge (Seite vorhanden, derzeit leer)

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de)
- News-Container: `<li class="news-entry-to-limit ...">`, Datum aus `news-entry-new-2-date`-Div
- Amtsblatt-PDFs erfordern POST-Request mit Hash — URL zeigt auf Listing-Seite mit Anker `#gazette_ID`
- Zahlreiche HTML-Entities inkl. `&#8203;` (Zero-Width-Space) werden manuell dekodiert
- Notices-Seite ist strukturell identisch zur News-Seite
