# Bernau bei Berlin

Amtsfreie Stadt im Landkreis Barnim, Brandenburg.
Quelle: https://www.bernau.de

## Quellen

| Typ    | URL                                                                                |
|--------|------------------------------------------------------------------------------------|
| Events | https://www.bernau.de/de/rathaus-service/aktuelles/veranstaltungen.html            |
| News   | https://www.bernau.de/de/rathaus-service/aktuelles/stadtnachrichten.html           |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 05.05.2026 19:30 – Salsa Cubana für weit Fortgeschrittene, Klub am Steintor
> https://www.bernau.de/de/rathaus-service/aktuelles/veranstaltungen/artikel-salsa_cubana_fuer_weit_fortgeschrittene-2026-05-05.html

**News:**
> 05.05.2026 – Renaturierungsmaßnahme im Panke-Park abgeschlossen
> https://www.bernau.de/de/rathaus-service/aktuelles/stadtnachrichten/artikel-renaturierungsmassnahme-im-panke-park-abgeschlossen.html

## Datenqualität (Stand 2026-05-05)

- **Events:** 30 Einträge, 29 mit Uhrzeit, 29 mit Ort. Zeitraum: 2026-05-05 – 2026-05-06 (laufende Woche).
- Events haben eigene URLs pro Artikel.
- **News:** 30 Einträge, alle mit `publishedAt`.

## Besonderheiten

- CMS: **B.E.S.T. CMS** (TYPO3-basiert, Bernau-spezifisch)
- Events: `<div class="eventListItem">` je Event; Datum aus URL-Suffix `-YYYY-MM-DD.html`; Zeit aus `HH:MM &ndash; HH:MM Uhr`; Ort aus 3. `<li>` in `eventData dateText`
- News: `<article id="article_SLUG">`, Datum aus `<p class="dateText">Wochentag, DD. Monat YYYY</p>`
- Die Events-Seite zeigt nur aktuelle/nächste Termine (kurzes Zeitfenster)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 5)
2. `news: N Einträge` ausgibt (N ≥ 5)
3. Falls events = 0: Prüfen ob die Events-Seite noch `class="eventListItem"` enthält
4. Falls news = 0: Prüfen ob die News-Seite noch `id="article_"` enthält
