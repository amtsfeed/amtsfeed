# Löwenberger Land

Amt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.loewenberger-land.de

## Quellen

| Typ    | URL                                                          |
|--------|--------------------------------------------------------------|
| News   | https://www.loewenberger-land.de/news/rss.xml                |
| Events | https://www.loewenberger-land.de/veranstaltungen/index.php   |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-03 – 04.05.2026: Schadstoffmobil im Löwenberger Land  
> https://www.loewenberger-land.de/news/index.php?news=1215169

## Datenqualität (Stand 2026-05-06)

- **News:** 20 Einträge; Datum aus RFC-2822 `<pubDate>` im RSS-Feed
- **Events:** via HTML-Scraping `/veranstaltungen/index.php` (events-entry-3)

## Besonderheiten

- CMS: **PortUNA** (RSS für News, HTML-Scraping für Events)
- News-ID: `loewenberger-land-news-{ID}` aus URL-Muster `/news/\d+/{ID}/`
- Events-ID: `loewenberger-land-event-{ID}` aus `/veranstaltungen/{ID}/`-URL

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob `/news/rss.xml` noch `<item>`-Einträge enthält
3. Falls events = 0: wenige Events möglich; Prüfen ob `events-entry-3` noch im HTML vorkommt
