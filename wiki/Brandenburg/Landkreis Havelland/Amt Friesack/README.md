# Amt Friesack

Amt im Landkreis Havelland, Brandenburg.
Quelle: https://www.amt-friesack.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.amt-friesack.de/news/1 |
| Events           | https://www.amt-friesack.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.amt-friesack.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.amt-friesack.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus `<div class="news-entry-new-2-date">` (Format "Mo, 29. Mai 2026")
- **Events:** ~60 Einträge, Datum aus URL-Muster `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`
- **Amtsblatt:** ~680 Einträge (zurück bis Anfang 2000er), Datum aus Tabellenzeile `<td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>`
- **Bekanntmachungen:** ~10 Einträge, Datum aus `<td class="table-title">`, PDFs direkt verlinkt

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de)
- News-Titel sind in `<h5>` (nicht `<h3>` wie bei den anderen beiden Havelland-Ämtern) — Regex matched daher `<h[1-6]>`
- Amtsblatt-PDFs erfordern POST-Request mit `hash` — URL zeigt auf Listing-Seite mit Anker `#gazette_ID`
- Bekanntmachungen: `<td class="table-title">DD.&#8203;MM.&#8203;YYYY</td>` mit Zero-Width-Spaces; PDF-Link in zweiter Zelle
- Events nutzen `event-entry-new-1`-Container (Datum-Bug: `<time datetime="1970-01-01">` — daher Datum aus URL)
