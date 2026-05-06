# Fürstenberg/Havel

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.fuerstenberg-havel.de

## Quellen

| Typ  | URL                                                          |
|------|--------------------------------------------------------------|
| News | https://www.fuerstenberg-havel.de/buergerservice/aktuelles   |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-06 – Sprechtag der Revierpolizei Fürstenberg am 07.05.2026 entfällt  
> https://www.fuerstenberg-havel.de/buergerservice/aktuelles/details/sprechtag-der-revierpolizei

## Datenqualität (Stand 2026-05-06)

- **News:** 12 Einträge; Datum aus Font-Awesome `fa-calendar-o`-Icon-Kontext

## Besonderheiten

- CMS: **TYPO3 tx_news** mit `newsbox`-Grid-Layout
- Struktur: `<div class="newsbox col-md-6 col-lg-4 my-4">` → `<a title="Title" href="/buergerservice/aktuelles/details/[slug]">` → `<i class="fa fa-calendar-o ..."></i>DD.MM.YYYY` + `<h4 class="h5 mb-1 text-white">Title</h4>`
- Datum nach `fa-calendar-o`-Icon (innerhalb 50 Zeichen), Format `DD.MM.YYYY`
- News-ID: `fuerstenberg-havel-news-{slug}`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob `class="newsbox` und `/aktuelles/details/` noch im HTML vorkommen
