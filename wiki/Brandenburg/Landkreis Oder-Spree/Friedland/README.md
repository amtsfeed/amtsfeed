# Friedland

Stadt Friedland, Landkreis Oder-Spree, Brandenburg.
Quelle: https://www.friedland-nl.de

## Quellen

| Typ       | URL                                                           |
|-----------|---------------------------------------------------------------|
| Events    | https://www.friedland-nl.de/veranstaltungen/index.php         |
| News      | https://www.friedland-nl.de/news/index.php?rubrik=15          |
| Amtsblatt | https://www.friedland-nl.de/amtsblatt/index.php               |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 11:00 Uhr bis 17:00 Uhr  
> museum oder-spree „lauschen und lärmen"  
> https://www.friedland-nl.de/veranstaltungen/2888788/2026/05/05/museum-oder-spree-lauschen-und-lärmen.html

**News** (hat echtes ISO-Datum direkt im datetime-Attribut):
> Di, 02. Dezember 2025  
> Windpark-Entwickler Qualitas Energy spendet für Veranstaltungszelt  
> https://www.friedland-nl.de/news/15/1167151/pressemitteilungen/windpark-entwickler-qualitas-energy-spendet-für-veranstaltungszelt.html

## Besonderheiten

- Events: anderes CMS-Template — Container ist `<div class="event-field">` (nicht `event-entry-new-1`)
- Events: Datum aus `<time class="event-time..." datetime="YYYY-MM-DD">` (ISO direkt, kein 1970-Placeholder)
- Events: Uhrzeit aus `<time class="event-time-start">` mit nested `<time>HH:MM</time>`
- News: `<div class="news-entry-new ...">` Container mit `<time datetime="YYYY-MM-DD">` — sehr zuverlässig
- News: Teaser in `<div class="news-entry-new-teaser">` (nicht `-text` wie bei anderen Orten)
- News-Rubrik: 15 (nicht 1 wie bei anderen Orten)
- Metadaten-Check: Detail-Page hat `<time datetime="YYYY-MM-DD">` (kein OG, kein JSON-LD-Datum) — stimmt mit Listenseite überein, kein Detail-Fetch nötig

## Amtsblatt

- Listing URL: `https://www.friedland-nl.de/amtsblatt/index.php` (PortUNA)
- Muster: `<td>Nr. NN/YYYY</td> <td>DD.&#8203;MM.&#8203;YYYY</td>`
- PDFs hinter POST/CSRF-Hash → Listing-URL als `url` verwendet

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler durchläuft und `events: N Einträge` ausgibt (N > 30)
2. `amtsblatt: N Einträge` ausgibt (N ≥ 5)
3. Das Beispiel-Event (ID `2888788`) in `events.json` vorhanden ist mit `startDate` enthält `T11:00`
4. Die Beispiel-News (ID `1167151`) in `news.json` vorhanden ist mit `publishedAt: 2025-12-02`
5. Falls Events 0: `event-field`-Class wurde möglicherweise umbenannt
