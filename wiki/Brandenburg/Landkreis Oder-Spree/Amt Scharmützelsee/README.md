# Amt Scharmützelsee

Amt im Landkreis Oder-Spree, Brandenburg. Gemeinden: Bad Saarow, Diensdorf-Radlow, Langewahl, Reichenwalde, Wendisch Rietz.
Quelle: https://www.amt-scharmuetzelsee.de

## Quellen

| Typ    | URL                                                              |
|--------|------------------------------------------------------------------|
| Events | https://www.amt-scharmuetzelsee.de/veranstaltungen/index.php    |
| News   | https://www.amt-scharmuetzelsee.de/news/1                        |

CMS: **PortUNA** (Verwaltungsportal)

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 07.05.2026  
> Vernissage "Von Erde und Zeit"  
> https://www.amt-scharmuetzelsee.de/veranstaltungen/2891253/2026/05/07/vernissage-von-erde-und-zeit.html

**News:**
> 27.04.2026  
> Newcastle-Krankheit: Sperrmaßnahmen in Storkow aufgehoben  
> https://www.amt-scharmuetzelsee.de/news/1/1228060/nachrichten/newcastle-krankheit-sperrmaßnahmen-in-storkow-aufgehoben.html

## Datenqualität (Stand 2026-05-05)

- **Events:** 120 Einträge mit Datum, Uhrzeit und Ort. Zeitraum: Mai 2026 – ca. September 2026.
- Events stammen aus dem gesamten Amt-Gebiet (Bad Saarow, Wendisch Rietz etc.) sowie Umgebung.
- **News:** 20 Einträge, mit Veröffentlichungsdatum.

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de) — statisch abrufbar, kein JavaScript nötig
- Event-Variante: `event-entry-new-2`
- Event-Container: `<div class="event-entry-new-2">`
- Event-Datum: `<time datetime="YYYY-MM-DD">` in `event-entry-new-2-time`
- Event-Uhrzeit: `<time>HH:MM</time>` in `event-entry-new-2-daytime`
- Event-ID: zusammengesetzt aus Nummer + Datum + Slug (recurring events haben unterschiedliche URLs)
- News-Container: `<li class="news-entry-to-limit row events-entry-3">`
- News-Datum: `<time class="events-entry-3-time" datetime="YYYY-MM-DD">`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 10)
2. Falls events = 0: Prüfen ob `class="event-entry-new-2"` noch in der HTML vorkommt
3. Falls news = 0: Prüfen ob `class="news-entry-to-limit"` noch in der HTML vorkommt
