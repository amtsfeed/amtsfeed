# Amt Seelow-Land

Verwaltungsamt im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.amt-seelow-land.de

## Quellen

| Typ    | URL                                                                 |
|--------|---------------------------------------------------------------------|
| Events | https://www.amt-seelow-land.de/veranstaltungen/index.php            |
| News   | https://www.amt-seelow-land.de/news/index.php?rubrik=1              |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> So, 01. März – Di, 30. Jun 2026  
> Open Air Ausstellung am Bauzaun - Stadt. Land. Klima.  
> Gutshaus der Zukunft Altfriedland gGmbH  
> https://www.amt-seelow-land.de/veranstaltungen/2863155/2026/03/01/open-air-ausstellung-am-bauzaun-stadt.-land.-klima.html

**News** (kein Datum auf der Seite — publishedAt = first-seen):
> Öffentliche Bekanntmachung des Landratsamtes … zur Bekämpfung der Newcastle-Krankheit (ND)  
> https://www.amt-seelow-land.de/news/1/1228664/nachrichten/öffentliche-bekanntmachung-…-nd.html

## Besonderheiten

- Events: HTML-Struktur `event-entry-new-1`, startDate aus URL-Pfad, endDate aus `datetime`-Attribut (1970-Placeholder wird ignoriert)
- News: **Kein Datum verfügbar** — weder Listenseite noch Detailseite noch HTTP-Header enthalten ein Veröffentlichungsdatum. Keine `<time>`-Tags, kein OG `article:published_time`, kein `Last-Modified`. Diese CMS-Konfiguration publiziert das Datum schlicht nicht. `publishedAt` = Zeitpunkt des ersten Abrufs, wird dann eingefroren.
- Alle Events auf einer Seite, keine Paginierung

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler durchläuft und `events: N Einträge` ausgibt (N > 50)
2. Das Beispiel-Event (ID `2863155`) in `events.json` vorhanden ist  
3. Die Beispiel-News (ID `1228664`) in `news.json` vorhanden ist
4. Falls N plötzlich 0 ist: HTML-Struktur hat sich geändert — `event-entry-new-1` Class prüfen
