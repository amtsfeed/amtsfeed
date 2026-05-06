# Hennigsdorf

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.hennigsdorf.de

## Quellen

| Typ  | URL                                               |
|------|---------------------------------------------------|
| News | https://www.hennigsdorf.de/Rathaus/Aktuelles/     |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-04 – Prignitz-Express mit Unterbrechungen  
> https://www.hennigsdorf.de/Rathaus/Aktuelles/Prignitz-Express-wieder-auf-Stammstrecke.php?...

## Datenqualität (Stand 2026-05-06)

- **News:** 9 Einträge; Datum aus `<span class="sr-only">Datum: </span>DD.MM.YYYY`-Pattern

## Besonderheiten

- CMS: **IKISS CMS** (`result-list`-Variante)
- Struktur: `<ul class="result-list">` → `<li>` mit `data-ikiss-mfid="7.3590.NNNN.1"` → `<span class="news-date">...<span class="sr-only">Datum: </span>DD.MM.YYYY</span>` + `<h3 class="list-title">Title</h3>`
- News-ID: `hennigsdorf-news-{NNNN}` aus `data-ikiss-mfid="7.3590.NNNN.1"`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. Falls news = 0: Prüfen ob `data-ikiss-mfid="7.3590.` noch im HTML von `/Rathaus/Aktuelles/` vorkommt
