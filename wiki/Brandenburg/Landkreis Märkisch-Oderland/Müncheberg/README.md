# Müncheberg

Amtsfreie Stadt im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.stadt-muencheberg.de

## Quellen

| Typ    | URL                                                                        |
|--------|----------------------------------------------------------------------------|
| Events | https://www.stadt-muencheberg.de/kultur-tourismus/events                   |
| News   | https://www.stadt-muencheberg.de/startseite (TYPO3 newsslider auf Homepage)|

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 04.09.2026 – Kurze Nacht in Müncheberg, Ernst-Thälmann-Straße  
> https://www.stadt-muencheberg.de/kultur-tourismus/events

**News:**
> 04.05.2026 – 81. Jahrestag "Tag der Befreiung"  
> https://www.stadt-muencheberg.de/buerger-stadt/stadtverwaltung/nachrichten/artikel/81-jahrestag-tag-der-befreiung

## Datenqualität (Stand 2026-05-05)

- **Events:** 8 Einträge, 6 mit Uhrzeit, kein Ort. Zeitraum: 2026-04-17 – 2026-09-04.
- Events haben keine eigenen URLs — alle verlinken auf die Events-Übersichtsseite.
- Mehrtägige Veranstaltungen erscheinen einmal (Startdatum + Enddatum), tägliche Einzeltermine als separate Einträge.
- Die Veranstaltungsliste erscheint in derselben Seite mehrfach (nach Monat gruppiert) — dedupliziert per ID.
- **News:** 14 Einträge vom Homepage-Slider, alle mit `publishedAt`.

## Besonderheiten

- CMS: **TYPO3** mit eigenem newsslider-Extension (EXT:newsslider) + manuell gepflegte Veranstaltungsliste
- Events: Kein Events-Plugin — plain-HTML Textliste im TYPO3 Content Element
- Events-Datum-Format: `DD.MM.YYYY[ | ab H:MM Uhr]` oder `DD.MM.[YYYY] - DD.MM.YYYY[ | ab H:MM Uhr]`
- Unvollständige Startdaten (`DD.MM.`) bei Zeiträumen: Jahr wird vom Enddatum übernommen
- News via TYPO3 newsslider auf der Startseite: `<a class="card slick-link">`, Datum `<time itemprop="datePublished" datetime="YYYY-MM-DD">`
- News-Listenseite `/buerger-stadt/stadtverwaltung/nachrichten` liefert 403 → Homepage-Slider als Quelle

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 3)
2. `news: N Einträge` ausgibt (N ≥ 5)
3. Falls events = 0: Prüfen ob die Events-Seite noch `class="ce-bodytext"` enthält
4. Falls news = 0: Prüfen ob die Homepage noch `class="card slick-link"` enthält
