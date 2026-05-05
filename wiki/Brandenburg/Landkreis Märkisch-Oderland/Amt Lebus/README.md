# Amt Lebus

Verwaltungsamt im Landkreis Märkisch-Oderland, Brandenburg. Sitz: Lebus.
Quelle: https://www.amt-lebus.de

## Quellen

| Typ    | URL                                              |
|--------|--------------------------------------------------|
| Events | https://www.amt-lebus.de/veranstaltungen/index.php |
| News   | https://www.amt-lebus.de/news/1                |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event (nur Datum, kein Uhrzeit):**
> Di., 05.05.2026  
> Selbstverteidigung für Frauen  
> Ort: Podelzig  
> https://www.amt-lebus.de/veranstaltungen/2464901/2026/05/05/selbstverteidigung-für-frauen.html

**News:**
> 29.04.2026 – Ausbruch der Newcastle-Krankheit (ND) - Tierseuchenallgemeinverfügung  
> https://www.amt-lebus.de/news/1/1229001/nachrichten/...

## Datenqualität (Stand 2026-05-05)

- **Events:** 67 Einträge, **kein Uhrzeit** (nur Datum), alle 67 mit Ortsangabe. Event-Zeitraum: 2026-05-05 – 2026-12-29.
- **News:** 20 Einträge (1 Seite). Alle haben `publishedAt`.
- Die Events-Seite rendert jeden Event mehrfach (Kalender + Liste) — 650 DOM-Elemente, 67 unique IDs nach Dedup.
- Datum im News-Vorschautext kodiert als `DD.&#8203;MM.&#8203;YYYY:` (Zero-Width-Space).

## Besonderheiten

- CMS: **PortUNA** (Verwaltungsportal) — Event-Variante `events-entry-3`
- Events: `<div class="row events-entry-3">`, Datum aus `<time class="events-entry-3-time" datetime="YYYY-MM-DD">`, **keine Uhrzeit** im Listing; ID aus URL `/veranstaltungen/ID/YYYY/MM/DD/slug.html`; Ort aus `<p class="events-entry-3-location">`
- Events werden auf der Seite mehrfach gerendert (Kalender + Listenansicht) → Dedup über ID-Set nötig
- News: `<li class="news-entry-to-limit">`, Titel in `<h4 class="h4link"><a>`, Datum aus `<p class="vorschau">DD.MM.YYYY: TEXT</p>`
- News-ID aus URL: `/news/1/ID/nachrichten/slug`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N > 30)
2. Event-ID `2464901` in `events.json` vorhanden
3. News-ID `1229001` in `news.json` vorhanden
