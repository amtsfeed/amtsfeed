# Amt Biesenthal-Barnim

Amt im Landkreis Barnim, Brandenburg.
Quelle: https://www.amt-biesenthal-barnim.de

## Quellen

| Typ  | URL                                          |
|------|----------------------------------------------|
| News | https://www.amt-biesenthal-barnim.de/news    |

## Beispiele (Stand Einrichtung 2026-05-05)

**News:**
> 25.03.2026 – Feierliche Eröffnung des Erweiterungsbau der Kita „Schlossgeister" in Trampe  
> https://www.amt-biesenthal-barnim.de/news-reader/feierliche-eroeffnung-der-kita-schlossgeister

## Datenqualität (Stand 2026-05-06)

- **News:** 12 Einträge auf `/news`, alle mit Datum (deutsches Datumsformat: „DD. Mon YYYY").
- **Events:** Contao-Kalender unter `/veranstaltungskalender` vorhanden, aber aktuell nur 1 vergangenes Event sichtbar (`class="bygone"`). Keine events.json bis zukünftige Events erscheinen.

## Besonderheiten

- CMS: **Contao**
- News-Container: `<div class="newslist-timeline block ...">` mit `<div class="newslist-timeline-date">DD. Mon YYYY</div>`
- News-Titel: `<h4><a href="RELATIVER-PFAD">TITEL</a></h4>` – Pfad ist relativ, wird zu absolutem URL zusammengesetzt
- Monatsabkürzungen: deutsches 3-Buchstaben-Format (Jan, Feb, Mär, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez)
- News-URL-Muster: `https://www.amt-biesenthal-barnim.de/news-reader/{slug}`
- Events-Kalender: Contao `mod_eventlist_v2` unter `/veranstaltungskalender`
  - Event-Container: `<div class="mod_eventlist_v2">` → `<a href="Veranstaltung/SLUG" title="TITLE (Wochentag, DD.MM.YYYY, HH:MM)">`
  - Vergangene Events: `class="bygone"` — aktuell nur vergangene Events sichtbar, kein Scraper implementiert

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `news: N Einträge` ausgibt (N ≥ 3)
2. Falls news = 0: Prüfen ob die Seite noch `class="newslist-timeline block"` enthält
