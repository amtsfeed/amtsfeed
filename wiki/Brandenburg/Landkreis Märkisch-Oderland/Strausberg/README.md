# Strausberg

Amtsfreie Stadt im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.stadt-strausberg.de

## Quellen

| Typ    | URL                                                                                              |
|--------|--------------------------------------------------------------------------------------------------|
| Events | https://www.stadt-strausberg.de/veranstaltungen/YYYY-MM-01/monthname-YYYY/ (Monatsseiten)       |
| News   | rb_news-sitemap.xml + /aktuelles/ HTML (da /aktuelles/feed/ per robots.txt gesperrt ist)        |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 08.05.2026 – „Whisky erleben" – vom New Make bis zum lang gereiften Destillat  
> https://www.stadt-strausberg.de/veranstaltungen/2026-05-01/mai-2026/#veranstaltungen-28520-2026-05-08

**News:**
> 05.05.2026 – Strausberger Orgelsommer in St. Marien 2026  
> https://www.stadt-strausberg.de/aktuelles/strausberger-orgelsommer-in-st-marien-2026/

## Datenqualität (Stand 2026-05-05)

- **Events:** 482 Einträge (Mai–Juli 2026). Viele wiederkehrende Events (Sportgruppen etc.): 96 unique IDs, 260 Einträge im Mai.
- Events haben keine eigenen Detailseiten — URLs verweisen auf Anker `#veranstaltungen-{ID}-{YYYY-MM-DD}` auf der Monatsseite.
- Composite-ID nötig: `strausberg-{eventID}-{YYYYMMDD}` (gleiche Veranstaltung, verschiedene Termine).
- **News:** 19 Einträge aus `rb_news-sitemap.xml` (most recent 20), mit Titel aus `/aktuelles/` HTML.

## Besonderheiten

- CMS: **WordPress** mit Custom Post Types `rb_events` (Events) und `rb_news` (News)
- `/aktuelles/feed/` und alle `*/feed/`-Pfade per robots.txt gesperrt → Sitemap + HTML kombiniert
- News-Strategie: Sitemap für URLs+Datum, HEAD-Request für Post-ID (aus `Location: /aktuelles/#post-{ID}`), HTML für Titel
- Events-Monatsnavigation: `/veranstaltungen/YYYY-MM-01/{monat}-YYYY/` (z.B. `mai-2026`, `juni-2026`)
- März: URL-Slug ist `marz` (ä → a in WordPress)
- Events-Artikel: `<article class="rb-event-item rb-event-item-id-{ID}-{YYYY-MM-DD} ...">`
- Ort: `<address class="rb-event-item-location">` (mit Google-Maps-Link)
- WP REST API: `rb_news` und `rb_events` nicht als REST-Endpunkt verfügbar

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 50)
2. `news: N Einträge` ausgibt (N ≥ 5)
3. Falls events = 0: Prüfen ob Monatsseite noch `class="rb-event-item"` enthält
4. Falls news-Dates fehlen: `rb_news-sitemap.xml` prüfen ob `<lastmod>` noch vorhanden
5. Falls news-Titel fehlen: Prüfen ob `/aktuelles/` noch `class="rb-news-item-id{ID}"` enthält
