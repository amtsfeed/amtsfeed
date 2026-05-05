# Bad Freienwalde (Oder)

Amtsfreie Stadt (Kurstadt) im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://bad-freienwalde.de

## Quellen

| Typ    | URL                                                                 |
|--------|---------------------------------------------------------------------|
| Events | https://bad-freienwalde.de/veranstaltungen/                        |
| News   | https://bad-freienwalde.de/wp-json/wp/v2/posts (WordPress REST API) |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event (mit Uhrzeit und Ort):**
> 26.04.2026 bis 25.10.2026, 15:00 Uhr  
> Sonntag um Drei - Live Konzerte in der ehemaligen Brennerei Cöthen  
> Ort: Brennerei Cöthen  
> https://bad-freienwalde.de/veranstaltungen/sonntag-um-drei-live-konzerte-in-der-ehemaligen-brennerei-coethen/

**News:**
> 05.05.2026 – Ausschreibung: Händler, Gastronomen und Vereine für das Altstadtfest  
> https://bad-freienwalde.de/ausschreibung-zum-altstadtfest-2026/

## Datenqualität (Stand 2026-05-05)

- **Events:** 14 Einträge (nach Dedup und Filterung), alle mit Uhrzeit und Ort. Zeitraum: 2026-04-26 – 2026-05-16.
- Ein Event hatte Startdatum 16.05.1970 (Epoch-0-Bug im TMB-Plugin) → gefiltert.
- Einige Events sind mehrtägig (gleiche ID, unterschiedliche Tagesdaten) → composite ID `{tmb-event-id}-{YYYYMMDD}`.
- **News:** 20 Einträge via WordPress REST API, alle mit `publishedAt` (datetime-präzise).

## Besonderheiten

- CMS: **WordPress** mit TMB Events Plugin + WordPress REST API für News
- Events-Plugin: TMB Events (tourism-data-hub.de) — HTML-Scraping nötig
- Events-Datum: `DD.MM.YYYY bis DD.MM.YYYY | H:MM Uhr` (Start und Ende)
- Events mit Startjahr < 2000 werden gefiltert (Epoch-0-Bug)
- News per WP REST API: `/wp-json/wp/v2/posts?per_page=20` — strukturierte JSON-Daten
- News-URLs sind direkt unter der Rootdomain (nicht unter `/news/`)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N > 3)
2. `news: N Einträge` ausgibt (N ≥ 5)
3. Event-ID `1114501-20260426` in `events.json` vorhanden
4. Falls events = 0: TMB-Plugin prüfen oder ob Events direkt in WordPress verwaltet werden
