# Gransee

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.gransee.de

## Quellen

| Typ    | URL                                                             |
|--------|-----------------------------------------------------------------|
| Events | https://www.gransee.de/wp-json/tribe/events/v1/events           |

## Beispiele (Stand Einrichtung 2026-05-06)

**Events:**
> 2026-05-06 – Fotoausstellung von Jürgen Graetz „Essen + Trinken"  
> https://www.gransee.de/event/fotoausstellung-von-juergen-graetz-essen-trinken/2026-05-06/

## Datenqualität (Stand 2026-05-06)

- **Events:** 470 Einträge; Datum aus `start_date`-Feld der REST-API (`YYYY-MM-DD HH:MM:SS`)
- **News:** nicht verfügbar (keine News-Seite gefunden)

## Besonderheiten

- CMS: **WordPress + The Events Calendar** (Tribe Events REST API)
- REST-Endpoint: `/wp-json/tribe/events/v1/events?per_page=100&start_date=YYYY-MM-DD`
- Paginierung via `next_rest_url`-Feld in der Response
- Event-ID: `gransee-event-{ev.id}` aus numerischer WordPress-Post-ID
- Ort: aus `venue.venue` + `venue.city` zusammengesetzt (falls vorhanden)
- Zeitzone: Datumsfelder werden mit `new Date(ev.start_date).toISOString()` konvertiert

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `events: N Einträge` (N ≥ 10) ausgibt
2. Falls events = 0: Prüfen ob `/wp-json/tribe/events/v1/events` noch JSON mit `events`-Array zurückgibt
