# Amt Barnim-Oderbruch

Verwaltungsamt im Landkreis Märkisch-Oderland, Brandenburg. Sitz: Wriezen.
Quelle: https://www.barnim-oderbruch.de

## Quellen

| Typ       | URL                                                                     |
|-----------|-------------------------------------------------------------------------|
| Events    | https://www.barnim-oderbruch.de/aktuelles/veranstaltungen               |
| News      | https://www.barnim-oderbruch.de/aktuelles                               |
| Amtsblatt | https://www.barnim-oderbruch.de/aktuelles/bekanntmachungen/amtsblaetter |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 09.05.2026  
> Ausscheid der Freiwilligen Feuer- und Jugendwehren des Amtes Barnim-Oderbruch  
> https://www.barnim-oderbruch.de/aktuelles/veranstaltungen/detail/ausscheid-der-freiwilligen-feuer-und-jugendwehren-des-amtes-barnim-oderbruch

**News:**
> 27.04.2026 – Änderung Tourenplan - Altkleidermobil  
> https://www.barnim-oderbruch.de/aktuelles/detail/tourenplan-altkleidermobil

## Datenqualität (Stand 2026-05-05)

- **Events:** Nur 4 Einträge auf der Veranstaltungsseite. Kein Uhrzeit, kein Ort im Listing. 3 der 4 haben ein Datum.
- **News:** 7 Einträge auf /aktuelles, davon 5 mit `publishedAt`. 2 "statische" News-Einträge haben kein Datum.
- Sehr wenige Inhalte im Vergleich zu PortUNA-Seiten.

## Besonderheiten

- CMS: **TYPO3** mit EXT:news — komplett andere Struktur als PortUNA/NOLIS
- Events-URL: `/aktuelles/veranstaltungen` (TYPO3-Seite, nicht PortUNA `/veranstaltungen/index.php`)
- News-URL: `/aktuelles` (gemischte Seite mit Events + News)
- Item-Container: `<div class="post-item article...">`
- Datum: `<time itemprop="datePublished" datetime="YYYY-MM-DD">`
- Titel: `<span itemprop="headline">TITEL</span>`
- ID: Letztes Slug-Segment der URL (kein numerischer ID)
- Events ohne Datum bekommen `startDate = fetchedAt` (kein Datum im TYPO3-Listing)

## Amtsblatt

- Listing URLs: `/aktuelles/bekanntmachungen/amtsblaetter/YYYY` (aktuelles und Vorjahr)
- PDFs direkt verlinkt unter `/fileadmin/Daten/Aktuelles/Bekanntmachungen/Amtsblätter/Amtsblätter_YYYY/`
- Dateinamen gemischt: numerisch (`Amtsblatt_04-2025.pdf`) und Monatsname (`Amtsblatt_Barnim-Oderbruch_Januar_2025.pdf`)
- Sonderausgaben werden übersprungen (Dateiname enthält „Sonder")
- Kein Datum im HTML → `publishedAt = YYYY-MM-01`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 1)
2. `news: N Einträge` ausgibt (N ≥ 3)
3. `amtsblatt: N Einträge` ausgibt (N ≥ 5)
4. Falls N = 0: TYPO3-Seite auf Umstrukturierung prüfen (URL-Änderungen, andere Klassen)
