# Oranienburg

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://oranienburg.de

## Quellen

| Typ  | URL                                                               |
|------|-------------------------------------------------------------------|
| News | https://oranienburg.de/Rathaus-Service/Aktuelles/Meldungen/       |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-06 – Praktika bei der Stadtverwaltung weiter beliebt  
> https://www.oranienburg.de/Rathaus-Service/Aktuelles/Meldungen/Praktika-bei-der-Stadtverwaltung

## Datenqualität (Stand 2026-05-06)

- **News:** 24 Einträge; Datum aus `<small class="date">DD.MM.YYYY</small>`

## Besonderheiten

- CMS: **IKISS CMS** (`liste-titel`-Variante)
- Struktur: `<small class="date">DD.MM.YYYY</small>` + `<h4 class="liste-titel"><a href="/...Slug.php?...&FID=2967.NNNN.1&...">Title</a></h4>`
- Wichtig: `www.oranienburg.de` leitet ohne `www` weiter → BASE_URL ist `https://oranienburg.de` (kein www)
- News-ID: `oranienburg-news-{NNNN}` aus `FID=\d+.{NNNN}.\d+`-Muster in der URL

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 10) ausgibt
2. Falls news = 0: Prüfen ob `class="liste-titel"` und `FID=` noch im HTML von `/Rathaus-Service/Aktuelles/Meldungen/` vorkommen
3. Nicht `www.oranienburg.de` verwenden — Redirect auf no-www gibt 0 Bytes zurück
