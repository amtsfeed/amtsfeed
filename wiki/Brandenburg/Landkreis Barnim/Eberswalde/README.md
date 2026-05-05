# Eberswalde

Kreisstadt im Landkreis Barnim, Brandenburg.
Quelle: https://www.eberswalde.de

## Quellen

| Typ    | URL                                      |
|--------|------------------------------------------|
| Events | https://www.eberswalde.de/termine        |
| News   | https://www.eberswalde.de/aktuelles      |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 04.05.2026 11:00 – Ausstellung Tuchener Kartenwerke - Künstlerische Neuvermessung eines Barnimer Höhendorfs
> https://www.eberswalde.de/termine/ausstellung-tuchener-kartenwerke-kuenstlerische-neuvermessung-eines-barnimer-hoehendorfs-kopie-30

**News:**
> 04.05.2026 – Tag der Städtebauförderung - 9. Mai 2026
> https://www.eberswalde.de/aktuelles/tag-der-staedtebaufoerderung-9-mai-2026

## Datenqualität (Stand 2026-05-05)

- **Events:** 10 Einträge, alle mit Uhrzeit, 3 mit Enddatum. Zeitraum: 2026-05-04 – 2026-05-07 (laufende Woche).
- Events haben eigene URLs (absolute URLs im HTML).
- **News:** 10 Einträge, alle mit `publishedAt`.

## Besonderheiten

- CMS: **Craft CMS**
- Events: `<article class="event">` je Event; Datum aus `<span class="startdate">Wochentag, DD.MM.YYYY</span>`; Zeit aus `<span class="starttime">HH:MM Uhr</span>`; Enddatum optional aus `<span class="enddate">`
- News: `<article class="news-article news-article--list">`, Datum aus `<span class="date">Wochentag, DD.MM.YYYY</span>`; URL und Titel direkt im Block
- Die Events- und News-Seite zeigt nur aktuelle/nächste Termine (kurzes Zeitfenster)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 3)
2. `news: N Einträge` ausgibt (N ≥ 3)
3. Falls events = 0: Prüfen ob die Events-Seite noch `<article class="event">` enthält
4. Falls news = 0: Prüfen ob die News-Seite noch `<article class="news-article news-article--list">` enthält
