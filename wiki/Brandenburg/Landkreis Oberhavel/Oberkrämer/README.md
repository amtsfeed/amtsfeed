# Oberkrämer

Gemeinde im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.oberkraemer.de

## Quellen

| Typ  | URL                                  |
|------|--------------------------------------|
| News | https://www.oberkraemer.de/news/      |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> (kein Datum) – Besuch im Einwohnermeldeamt  
> https://www.oberkraemer.de/artikel-ansicht/show/besuch-einwohnermeldeamt-fuer-juni-bitte-termin

## Datenqualität (Stand 2026-05-06)

- **News:** 50 Einträge; Datum aus Font-Awesome `fa-clock-o`-Icon-Kontext (nicht immer vorhanden)

## Besonderheiten

- CMS: **TYPO3** mit eigener News-/Events-Seite
- Struktur: `<h2 class="second_font event_title">` → `<a class="readmore second_font" href="/artikel-ansicht/show/[slug]/">Title</a>` + `<i class="fa fa-fw fa-clock-o mr-1"></i>DD.MM.YYYY`
- Datum nach `fa-clock-o`-Icon (innerhalb 30 Zeichen), Format `DD.MM.YYYY`; nicht bei allen Einträgen vorhanden
- News-ID: `oberkraemer-news-{slug}` (max. 80 Zeichen)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 10) ausgibt
2. Falls news = 0: Prüfen ob `class="second_font event_title"` und `/artikel-ansicht/show/` noch im HTML vorkommen
