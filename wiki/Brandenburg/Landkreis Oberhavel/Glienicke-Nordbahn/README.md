# Glienicke/Nordbahn

Gemeinde im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.glienicke.eu

## Quellen

| Typ    | URL                                                                |
|--------|--------------------------------------------------------------------|
| News   | https://www.glienicke.eu/portal/rss.xml                            |
| Events | https://www.glienicke.eu/freizeit-kultur/veranstaltungskalender/   |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-06 – „Katze" und „Eule" abgerissen  
> https://www.glienicke.eu/portal/meldungen/-katze-und-eule-abgerissen-904013148-22451.html

## Datenqualität (Stand 2026-05-06)

- **News:** 10 Einträge; Datum aus RFC-2822 `<pubDate>` im RSS-Feed
- **Events:** via HTML-Scraping `/freizeit-kultur/veranstaltungskalender/` (events-entry-3 oder tab_link_entry)

## Besonderheiten

- CMS: **PortUNA** (RSS für News, HTML-Scraping für Events)
- News-ID: aus URL-Muster `/(\d+)/` in der Artikel-URL, prefixiert mit `glienicke-news-`
- Events-ID: `glienicke-event-{ID}` aus `/veranstaltungen/{ID}/`-URL
- Events: primär `<div class="row events-entry-3">` mit `datetime`-Attribut; Fallback: `<li class="tab_link_entry">` mit ID+Datum aus URL-Struktur

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob `/portal/rss.xml` noch `<item>`-Einträge enthält
3. Falls events = 0: wenige Events bei kleiner Gemeinde normal; Prüfen ob `events-entry-3` oder `tab_link_entry` noch im HTML vorkommen
