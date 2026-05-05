# Wriezen

Amtsfreie Stadt im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.wriezen.de

## Quellen

| Typ    | URL                                                                  |
|--------|----------------------------------------------------------------------|
| Events | https://www.wriezen.de/veranstaltungen/index.php?month=YYYY-MM       |
| News   | https://www.wriezen.de/news/1                                        |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 08.05.2026 – 09.05.2026  
> Career Compass Ausbildungs- & Jobmesse  
> https://www.wriezen.de/veranstaltungen/2856897/2026/05/08/career-compass-ausbildungs-amp-jobmesse.html

**News:**
> 30.04.2026 – Maibaumfest verzaubert wieder den Wriezener Marktplatz  
> https://www.wriezen.de/news/1/1229930/nachrichten/maibaumfest-verzaubert-wieder-den-wriezener-marktplatz.html

## Datenqualität (Stand 2026-05-05)

- **Events:** 6 Einträge (Mai 2026 + 3 Folgemonate). Zeitraum: 2026-05-08 – 2026-05-30.
- Events werden für 4 Monate (aktuell + 3 folgende) geladen und dedupliziert.
- Mehrtägige Events erscheinen in mehreren Kalenderzellen — dedupliziert per Event-ID aus URL.
- Einzeltag-Events haben keine `event-clndr-3-entry-duration`-Div — Datum wird aus der URL extrahiert.
- **News:** 6 Einträge auf `/news/1`, mit Datum im Vorschautext.

## Besonderheiten

- CMS: **PortUNA** (event-clndr-3-Variante)
- Events: Kalenderansicht mit Events in `data-events`-Attribut auf `<span class="event-clndr-3-day has-entries">`
- `data-events` ist doppelt kodiert (Attribut-Encoding + inneres HTML-Encoding) → 2× `decodeHtmlEntities` nötig
- Inneres HTML enthält außerdem `&auml;`/`&szlig;` etc. → Named Entities in `decodeHtmlEntities` behandeln
- Monatsnavigation: `?month=YYYY-MM`
- News-URL: `/news/{category}/{id}/nachrichten/{slug}.html` (nicht `/news/{id}/{YYYY}/{MM}/{DD}/...`)
- News-Container: `<li class="news-entry-to-limit">` (nicht `<div>`)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 3)
2. `news: N Einträge` ausgibt (N ≥ 3)
3. Falls events = 0: Prüfen ob Kalenderseite noch `class="event-clndr-3-day has-entries"` enthält
4. Falls events-Titel HTML-Entities enthalten: `decodeHtmlEntities` um fehlende Named Entities erweitern
