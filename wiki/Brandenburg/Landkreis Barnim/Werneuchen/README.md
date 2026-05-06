# Werneuchen

Stadt im Landkreis Barnim, Brandenburg.
Quelle: https://www.werneuchen-barnim.de

## Quellen

| Typ    | URL                                                                                                                    |
|--------|------------------------------------------------------------------------------------------------------------------------|
| News   | https://www.werneuchen-barnim.de/portal/rss.xml                                                                       |
| Events | https://www.werneuchen-barnim.de/veranstaltungen/veranstaltungen.ical?selected_kommune=30690&intern=0                 |

## Beispiele (Stand Einrichtung 2026-05-05)

**News:**
> 05.05.2026 – Weitere Sperrungen von Bahnübergängen für Arbeiten der Deutschen Bahn  
> https://www.werneuchen-barnim.de/portal/meldungen/weitere-sperrungen-von-bahnuebergaengen-fuer-arbeiten-der-deutschen-bahn-900000853-30690.html?rubrik=900000001

## Datenqualität (Stand 2026-05-06)

- **Events:** 3 Einträge via iCal-Export (365 Tage ab heute); ID aus `X-ID`-Feld (`30690_NNNNNNNN`)
- **News:** 10 Einträge, alle mit Datum und Uhrzeit aus RSS pubDate

## Besonderheiten

- CMS: **NOLIS** (RSS-Feed für News, iCal-Export für Events)
- News-Quelle: RSS-Feed `/portal/rss.xml`
- News-Datum aus RFC-2822 `<pubDate>` via `new Date(pubDate).toISOString()`
- News-ID aus URL-Muster `(\d{6,})-30690`, prefixiert mit `werneuchen-`
- Events: iCal-Endpoint `/veranstaltungen/veranstaltungen.ical` mit Parametern:
  `selected_kommune=30690&intern=0&beginn=YYYYMMDD000000&ende=YYYYMMDD235959`
- Event-ID aus VEVENT-Feld `X-ID: 30690_NNNNNNNN` (letztes Segment), prefixiert mit `werneuchen-event-`
- Event-URL: `https://www.werneuchen-barnim.de/veranstaltungen/veranstaltungen/veranstaltung/{eventId}-30690.html`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob der RSS-Feed unter `/portal/rss.xml` noch `<item>`-Einträge enthält
3. Falls events = 0: Prüfen ob iCal-Endpoint noch `BEGIN:VEVENT` enthält; wenige Events bei kleiner Gemeinde normal
