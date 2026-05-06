# Velten

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://velten.de

## Quellen

| Typ  | URL                                                                        |
|------|----------------------------------------------------------------------------|
| News | https://velten.de/Verwaltung-Politik/Aktuelles/Nachrichten/                |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-04 – Kitaverwaltung am Dienstag, 12. Mai 2026, geschlossen  
> https://velten.de/Verwaltung-Politik/Aktuelles/Nachrichten/Kitaverwaltung-am-Dienstag-12-Mai

## Datenqualität (Stand 2026-05-06)

- **News:** 15 Einträge; Datum aus `<span class="sr-only">Datum: </span>DD.MM.YYYY`-Pattern

## Besonderheiten

- CMS: **IKISS CMS** (`result-list`-Variante)
- Struktur: `<ul class="result-list">` → `<li>` mit `data-ikiss-mfid="7.3631.NNNN.1"` → `<small>...<span class="sr-only">Datum: </span>DD.MM.YYYY</small>` + `<h3 class="list-title">Title</h3>`
- Wichtig: `www.velten.de` leitet ohne `www` weiter → BASE_URL ist `https://velten.de` (kein www)
- News-ID: `velten-news-{NNNN}` aus `data-ikiss-mfid="7.3631.NNNN.1"`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob `data-ikiss-mfid="7.3631.` noch im HTML von `/Verwaltung-Politik/Aktuelles/Nachrichten/` vorkommt
3. Nicht `www.velten.de` verwenden — Redirect auf no-www gibt leere Seite zurück
