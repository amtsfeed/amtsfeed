# Hohen Neuendorf

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.hohen-neuendorf.de

## Quellen

| Typ  | URL                                              |
|------|--------------------------------------------------|
| News | https://www.hohen-neuendorf.de/de/rss-feed.xml   |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-06 – VERNETZUNGSTREFFEN FÜR ALLEINERZIEHENDE UND IHRE KINDER  
> https://hohen-neuendorf.de/de/stadt-leben/veranstaltungskalender/vernetzungstreffen-fur-alleinerziehende

## Datenqualität (Stand 2026-05-06)

- **News:** 10 Einträge; Datum aus RFC-2822 `<pubDate>` im RSS-Feed

## Besonderheiten

- CMS: **Drupal** mit RSS-Feed
- News-ID: aus URL-Muster `/de/.../([^/?#]+)` (letztes Pfad-Segment), prefixiert mit `hohen-neuendorf-news-`
- RSS-Feed unter `/de/rss-feed.xml`; unterstützt CDATA-umschlossene Titel

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob `/de/rss-feed.xml` noch `<item>`-Einträge enthält
