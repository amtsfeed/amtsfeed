# Bad Saarow

Amtsfreie Gemeinde (Kneipp-Kurort) im Landkreis Oder-Spree, Brandenburg.
Quelle: https://bad-saarow.de

## Quellen

| Typ    | URL                                                                                   |
|--------|---------------------------------------------------------------------------------------|
| Events | https://www.scharmuetzelsee.de/veranstaltungen/veranstaltungsplan (Tourismusverein)  |
| News   | (keine — bad-saarow.de ist Tourismus-Website ohne eigenen Nachrichtenbereich)         |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 03.07.2026 bis 05.07.2026  
> Sommerfest am See im Kurpark Bad Saarow  
> https://www.scharmuetzelsee.de/event/sommerfest-am-see-im-kurpark-bad-saarow

## Datenqualität (Stand 2026-05-05)

- **Events:** 19 Einträge, alle mit Datum (kein Ort, keine Uhrzeit). Zeitraum: 2026-05-05 – 2026-09-20.
- Events stammen vom regionalen Tourismusverein Scharmützelsee (nicht Bad-Saarow-spezifisch gefiltert).
- Enthält Events aus dem gesamten Scharmützelsee-Gebiet (z.B. auch Wendisch Rietz, Storkow).
- **News:** Keine — bad-saarow.de ist eine Tourismus-Website (Drupal + carbonara-Theme) ohne Nachrichtenbereich.

## Besonderheiten

- CMS: **Drupal** (carbonara-Theme) auf bad-saarow.de — Content JS-gerendert, kein statisches HTML
- Events: Weiterleitung auf scharmuetzelsee.de → TYPO3-Seite mit DAMAS-Tourismus-Datensystem
- Event-Container: `<div class="teaser-card result-item" data-type="Event">`
- Event-Titel: `<span class="teaser-card__header">`, Datum: `<span class="teaser-card__subheader">`
- Event-URL: `<a class="teaser-card__link" href="https://www.scharmuetzelsee.de/event/SLUG">`
- Dedup per URL-Slug (Linienfahrten erscheinen mehrfach im Slider)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 5)
2. Falls events = 0: Prüfen ob scharmuetzelsee.de noch `class="teaser-card result-item"` enthält
3. Falls events deutlich weniger: TYPO3-Seite kann den Slider-Content anders rendern
