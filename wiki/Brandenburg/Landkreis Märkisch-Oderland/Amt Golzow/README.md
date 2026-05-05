# Amt Golzow

Verwaltungsamt im Landkreis Märkisch-Oderland, Brandenburg. Sitz: Golzow.
Quelle: https://www.amt-golzow.de

## Quellen

| Typ    | URL                                              |
|--------|--------------------------------------------------|
| Events | https://www.amt-golzow.de/veranstaltungen/index.php |
| News   | https://www.amt-golzow.de/news/1                |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event (mit Uhrzeit und Ort):**
> Do., 07.05.2026, 18:00 Uhr  
> Dein Garten, fit für´s Klima!  
> Ort: Seelow  
> https://www.amt-golzow.de/veranstaltungen/2886766/2026/05/07/dein-garten-fit-fürs-klima.html

**News:**
> 05.05.2026 – Tierseuchenallgemeinverfügung zum Schutz gegen die Newcastle Disease  
> https://www.amt-golzow.de/news/1/1231225/nachrichten/...

## Datenqualität (Stand 2026-05-05)

- **Events:** 44 Einträge, davon 39 mit Uhrzeit, alle 44 mit Ortsangabe. Event-Zeitraum: 2026-05-07 – 2027-05-01.
- **News:** 20 Einträge (1 Seite). Alle haben `publishedAt` (Datum aus Vorschautext).
- Datum im News-Vorschautext kodiert als `DD.&#8203;MM.&#8203;YYYY:` (Zero-Width-Space als Trenner) → wird korrekt geparst.
- Einige Eventtitel sind doppelt HTML-kodiert (`&amp;amp;`) → wird korrekt dekodiert.

## Besonderheiten

- CMS: **PortUNA** (Verwaltungsportal) — Event-Variante `event-box`
- Events: startDate aus URL-Pfad `/veranstaltungen/ID/YYYY/MM/DD/slug.html`; Zeit aus `<span class="event-time"><time>HH:MM</time> Uhr</span>`; Ort aus `<span class="event-ort">`
- News: `<li class="news-entry-to-limit">`, Titel in `<h3 class="...h4link"><a>`, Datum aus `<p class="vorschau">DD.MM.YYYY: TEXT</p>`
- News-ID aus URL: `/news/RUBRIK/ID/slug` → numerische ID
- Einige News haben Vorschaubild-Link vor dem Titel-Link → Titel wird gezielt aus `<h3>` extrahiert

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N > 20)
2. `news: N Einträge` ausgibt (N ≥ 10)
3. Event-ID `2886766` in `events.json` vorhanden
4. News-ID `1231225` in `news.json` vorhanden
