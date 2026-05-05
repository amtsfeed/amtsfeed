# Amt Falkenberg-Höhe

Verwaltungsamt im Landkreis Märkisch-Oderland, Brandenburg. Sitz: Falkenberg/Mark.
Quelle: https://www.amt-fahoe.de

## Quellen

| Typ    | URL                                               |
|--------|---------------------------------------------------|
| Events | https://www.amt-fahoe.de/veranstaltungen/index.php |
| News   | https://www.amt-fahoe.de/news/1                   |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event (mit Uhrzeit und Ort):**
> Fr., 08.05.2026, 09:00–15:00 Uhr  
> Career Compass Ausbildungs- & Jobmesse  
> Ort: Giebelseehalle, Petershagen/Eggersdorf  
> https://www.amt-fahoe.de/veranstaltungen/2865839/2026/05/08/career-compass-ausbildungs-jobmesse.html

**News (ohne Datum):**
> Generation-Schach: Jung und Alt am Brett gesucht!  
> https://www.amt-fahoe.de/news/1/1229840/nachrichten/generation-schach-jung-und-alt-am-brett-gesucht.html

## Datenqualität (Stand 2026-05-05)

- **Events:** 18 Einträge, davon 15 mit Uhrzeit, alle mit Ortsangabe. Event-Zeitraum: 2026-05-07 – 2026-10-25.
- **News:** 20 Einträge (1 Seite). Nur 2 haben `publishedAt` — die meisten News-Einträge haben kein Datum im Listing, nur `fetchedAt`.
- Ältere News-Items haben Datum am Anfang des Vorschautexts (`DD.MM.YYYY:`), neuere nicht.

## Besonderheiten

- CMS: **PortUNA** (Verwaltungsportal) — Event-Variante `event-box` (identisch mit Amt Golzow)
- Domain: `amt-fahoe.de` (Kurzform für Falkenberg-Höhe)
- Events: startDate aus URL-Pfad; Zeit aus `<span class="event-time"><time>HH:MM</time> Uhr</span>`; Ort aus `<span class="event-ort">`
- News: Kein standardmäßiges Datum im Listing → `publishedAt` fehlt bei den meisten Einträgen

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N > 5)
2. Event-ID `2897436` (Geistliche Abendmusik) in `events.json` vorhanden
3. News-ID `1229840` in `news.json` vorhanden
