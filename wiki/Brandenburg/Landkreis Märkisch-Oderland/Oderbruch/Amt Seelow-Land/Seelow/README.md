# Seelow

Stadt Seelow, Ortsteil unter Amt Seelow-Land, Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.seelow.de

## Quellen

| Typ    | URL                                              |
|--------|--------------------------------------------------|
| Events | https://www.seelow.de/veranstaltungen/index.php  |
| News   | https://www.seelow.de/news/1481                  |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> Briefmarkentauschabende  
> 07.05.2026 - 19:00 Uhr bis 21:00 Uhr  
> Alte Dampfbäckerei  
> https://www.seelow.de/veranstaltungen/2866952/2026/05/07/briefmarkentauschabende.html

**News** (hat echtes Datum):
> Mo, 04. Mai 2026  
> Internationaler Tag der Feuerwehrleute  
> https://www.seelow.de/news/1481/1230656/kategorie/internationaler-tag-der-feuerwehrleute.html

## Besonderheiten

- Events: Kalender-Widget (`event-clndr-2`), wird monatsweise abgerufen (12 Monate voraus, `?beginn=YYYY-MM-01&ende=YYYY-MM-DD`)
- Events enthalten Uhrzeit direkt im `startDate` (z.B. `2026-05-07T19:00:00Z`)
- News: **hat echtes Datum** in `<div class="news-entry-new-3-date">` — `publishedAt` ist zuverlässig
- Metadaten-Check: Detail-Page enthält `<time datetime="YYYY-MM-DD">` (kein OG, kein JSON-LD-Datum) — stimmt mit Listenseiten-Datum überein, kein Mehrwert durch Detail-Fetch

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler durchläuft und `events: N Einträge` ausgibt (N > 20)
2. Das Beispiel-Event (ID `2866952`) in `events.json` vorhanden ist
3. Die Beispiel-News (ID `1230656`) in `news.json` vorhanden ist
4. Falls Events 0: `event-clndr-2`-Class oder `?beginn=`-Parameter hat sich geändert
