# Hoppegarten

Amtsfreie Gemeinde im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.gemeinde-hoppegarten.de

## Quellen

| Typ    | URL                                                    |
|--------|--------------------------------------------------------|
| Events | https://www.gemeinde-hoppegarten.de/veranstaltungen/  |
| News   | https://www.gemeinde-hoppegarten.de/news/1             |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 2026-05-10 – Einweihung Spielplatz  
> https://www.gemeinde-hoppegarten.de/veranstaltungen/NNNN/2026/05/10/slug.html

**News:**
> 05.05.2026 – Gemeindevertretung beschließt Haushalt  
> https://www.gemeinde-hoppegarten.de/news/1/NNNN/nachrichten/slug.html

## Datenqualität (Stand 2026-05-05)

- **Events:** 12 Einträge, alle mit Datum, viele mit Zeit und Ort.
- **News:** 50 Einträge (limitiert), alle mit Datum.

## Besonderheiten

- CMS: **PortUNA** (`event-entry-new-1`-Variante)
- Event-Container: `<div class="... event-entry-new-1">` (nicht `event-entry-new-1-content` etc.)
- Datum aus URL-Pfad (time-Elemente haben datetime="1970-01-01"-Bug)
- Der Server liefert bei vollem User-Agent alle historischen Nachrichten (~1034) → limitiert auf 50
- News-Container: `<li class="news-entry-to-limit ...">` (events-entry-3-Stil)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 5)
2. `news: N Einträge` ausgibt (N ≤ 50)
3. Falls events = 0: Prüfen ob die Seite noch `event-entry-new-1-content` enthält
4. Falls news = 0: Prüfen ob die Seite noch `news-entry-to-limit` enthält
