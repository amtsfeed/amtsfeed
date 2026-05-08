# Heideblick

Gemeinde im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.heideblick.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.heideblick.de/news/index.php?archiv=1&rubrik=1 |
| Events           | https://www.heideblick.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.heideblick.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.heideblick.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 3836 Einträge (Archiv), Datum aus `<h3 class="title_archive_NN legacy_h6">DD.MM.YYYY</h3>`
- **Events:** 23 Einträge, Datum aus URL-Muster `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`
- **Amtsblatt:** 14 Einträge, Datum aus Tabellenzeile `<td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>`
- **Bekanntmachungen:** 57 Einträge, Datum aus Tabellenzelle `<td valign="top">DD.MM.YYYY</td>`

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de)
- News-Archivseite gruppiert Artikel nach Datum unter `<h3 class="title_archive_NN">` — sehr großes Archiv
- `&#8203;` (Zero-Width-Space) wird aus HTML bereinigt
- Events: Veranstaltungsort aus `<p class="events-entry-3-location">` wird als `location`-Feld übernommen
- Amtsblatt: direkter PDF-Link in letzter Tabellenspalte (falls vorhanden), sonst Link zur Listenseite
