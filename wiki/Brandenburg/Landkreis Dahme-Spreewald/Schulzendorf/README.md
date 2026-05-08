# Schulzendorf

Gemeinde im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.schulzendorf.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.schulzendorf.de/news/index.php?rubrik=1 |
| Events           | https://www.schulzendorf.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.schulzendorf.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.schulzendorf.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 19 Einträge, Datum aus `<p class="vorschau">DD.MM.YYYY:`-Präfix; bis zu 5 Seiten via `?bis=YYYY-MM-DD`-Paginierung
- **Events:** 3 Einträge, Datum aus URL-Muster `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`
- **Amtsblatt:** 254 Einträge, Datum aus Tabellenzeile `<td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>`; PDFs via Formular (URL zeigt auf Listenseite)
- **Bekanntmachungen:** 313 Einträge, Datum aus `<td class="table-title">DD.MM.YYYY</td>`

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de)
- News-Paginierung via `?bis=YYYY-MM-DD`-Parameter (bis 5 Seiten)
- Amtsblatt-PDFs erfordern POST-Formular — URL verweist auf Listenseite
- `&#8203;` (Zero-Width-Space) wird bereinigt
