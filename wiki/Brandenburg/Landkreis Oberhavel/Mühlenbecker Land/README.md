# Mühlenbecker Land

Gemeinde im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.muehlenbecker-land.de

## Quellen

| Typ  | URL                                                                          |
|------|------------------------------------------------------------------------------|
| News | https://exchange.cmcitymedia.de/muehlenbeckerland/rssNews.php                |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-05 – Rollender Treffpunkt macht Station am Mühlenbecker Land  
> https://www.muehlenbecker-land.de/index.php?id=24&no_cache=1&publish[id]=1626220

## Datenqualität (Stand 2026-05-06)

- **News:** 1 Eintrag (externer RSS-Feed, wenige Einträge); Datum aus RFC-2822 `<pubDate>`

## Besonderheiten

- CMS: **TYPO3** mit externem RSS-Feed via `cmcitymedia.de`
- RSS-Feed liegt auf separater Domain `exchange.cmcitymedia.de`, nicht auf der Gemeinde-Domain
- News-ID: aus `<guid>`-Feld oder URL, numerische ID aus `(\d+)` extrahiert, prefixiert mit `muehlenbecker-land-news-`
- Feed liefert nur sehr wenige Einträge (Stand Mai 2026: 1 Eintrag)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft
2. Falls news = 0: Prüfen ob `https://exchange.cmcitymedia.de/muehlenbeckerland/rssNews.php` noch `<item>`-Einträge enthält
