# Amt Nennhausen

Amt im Landkreis Havelland, Brandenburg.
Quelle: https://www.amt-nennhausen.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.amt-nennhausen.de/news/1 |
| Events           | https://www.amt-nennhausen.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.amt-nennhausen.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.amt-nennhausen.de/bekanntmachungen/index.php (derzeit leer) |

## Datenqualität

- **News:** 50 Einträge — **kein `publishedAt`** verfügbar, weil die Listenansicht weder Datum noch `news-entry-new-2-date`-Div ausspielt; nur Titel + Vorschautext
- **Events:** ~68 Einträge, Datum aus URL-Muster `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`
- **Amtsblatt:** ~138 Einträge, Datum aus Tabellenzeile `<td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>`
- **Bekanntmachungen:** 0 Einträge — Seite vorhanden, liefert aktuell „Es sind leider keine Daten vorhanden."

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de)
- News-Titel sind in `<h3 class="legacy_h4 title_news_19">` und enthalten **keinen Datums-Container** — `publishedAt` bleibt entsprechend leer
- Amtsblatt-PDFs erfordern POST-Request mit `hash` — URL zeigt auf Listing-Seite mit Anker `#gazette_ID`
- Bekanntmachungen-Seite existiert, aber die Verwaltung hat dort offenbar keine Inhalte gepflegt; der Scraper überschreibt vorhandene Einträge nicht, wenn die Quelle leer geliefert wird
