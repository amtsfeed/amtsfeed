# Werneuchen

Stadt im Landkreis Barnim, Brandenburg.
Quelle: https://www.werneuchen-barnim.de

## Quellen

| Typ    | URL                                                    |
|--------|--------------------------------------------------------|
| News   | https://www.werneuchen-barnim.de/portal/rss.xml        |

Kein Events-Feed verfügbar (Kalender ist formulargesteuert, nicht scrapbar).

## Beispiele (Stand Einrichtung 2026-05-05)

**News:**
> 05.05.2026 – Weitere Sperrungen von Bahnübergängen für Arbeiten der Deutschen Bahn  
> https://www.werneuchen-barnim.de/portal/meldungen/weitere-sperrungen-von-bahnuebergaengen-fuer-arbeiten-der-deutschen-bahn-900000853-30690.html?rubrik=900000001

## Datenqualität (Stand 2026-05-05)

- **Events:** Kalender ist formulargesteuert, nicht scrapbar – keine events.json wird erzeugt
- **News:** 10 Einträge, alle mit Datum und Uhrzeit aus RSS pubDate

## Besonderheiten

- CMS: **NOLIS** (RSS-Feed-Variante)
- Quelle: RSS-Feed `/portal/rss.xml`
- Datum aus RFC-2822 `<pubDate>` via `new Date(pubDate).toISOString()`
- ID aus URL-Muster `(\d{6,})-30690`, prefixiert mit `werneuchen-`
- Kalender-Seite ist formulargesteuert und nicht automatisiert scrapbar

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `news: N Einträge` ausgibt (N ≥ 5)
2. Falls news = 0: Prüfen ob der RSS-Feed unter `/portal/rss.xml` noch `<item>`-Einträge enthält
3. Falls IDs fehlen: Prüfen ob URL-Muster noch `(\d{6,})-30690` enthält
