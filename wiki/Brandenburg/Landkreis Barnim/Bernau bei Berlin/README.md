# Bernau bei Berlin

Amtsfreie Stadt im Landkreis Barnim, Brandenburg.
Quelle: https://www.bernau.de

## Quellen

| Typ       | URL                                                                                |
|-----------|------------------------------------------------------------------------------------|
| Events    | https://www.bernau.de/de/rathaus-service/aktuelles/veranstaltungen.html            |
| News      | https://www.bernau.de/de/rathaus-service/aktuelles/stadtnachrichten.html           |
| Amtsblatt | https://www.bernau.de/de/rathaus-service/aktuelles/amtsblatt.html                  |

## Amtsblatt

Die Amtsblätter werden unter `amtsblatt.html` nach Jahren geordnet (Jahresordner mit `?folder=NNN`).
Die Scraper-Logik holt die letzten 2 Jahresordner (aktuell + Vorjahr).

Titelformate im `title`-Attribut:
- `Amtsblatt 1 vom 26. Januar 2026 runterladen` (Nr. ohne Jahreszahl)
- `Amtsblatt 2/2025 vom 23. Februar 2025 runterladen` (Nr./Jahr)
- `Amtsblatt 4/2025 vom 28. April runterladen` (Nr./Jahr, Datum ohne Jahr)

**Beispiel:**
> Amtsblatt Nr. 4/2026 – 2026-04-27
> https://www.bernau.de/visioncontent/mediendatenbank/amtsblatt-20260427_final.pdf

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
- **Amtsblatt:** 16 Einträge (4 × 2026, 12 × 2025).

## Besonderheiten

- CMS: **B.E.S.T. CMS** (TYPO3-basiert, Bernau-spezifisch)
- Events: `<div class="eventListItem">` je Event; Datum aus URL-Suffix `-YYYY-MM-DD.html`; Zeit aus `HH:MM &ndash; HH:MM Uhr`; Ort aus 3. `<li>` in `eventData dateText`
- News: `<article id="article_SLUG">`, Datum aus `<p class="dateText">Wochentag, DD. Monat YYYY</p>`
- Die Events-Seite zeigt nur aktuelle/nächste Termine (kurzes Zeitfenster)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 5)
2. `news: N Einträge` ausgibt (N ≥ 5)
3. `amtsblatt: N Einträge` ausgibt (N ≥ 4)
4. Falls events = 0: Prüfen ob die Events-Seite noch `class="eventListItem"` enthält
5. Falls news = 0: Prüfen ob die News-Seite noch `id="article_"` enthält
6. Falls amtsblatt = 0: Prüfen ob `amtsblatt.html?folder=NNN` noch `title="Amtsblatt N vom DD. Month YYYY runterladen"` enthält
