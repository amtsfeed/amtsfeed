# Zehdenick

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.zehdenick.de

## Quellen

| Typ  | URL                                       |
|------|-------------------------------------------|
| News | https://www.zehdenick.de/nachrichten.html |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> (kein Datum) – Sperrung des Bahnübergangs Klausdamm vom 29.04. bis 30.04.  
> https://www.zehdenick.de/nachrichten.html

## Datenqualität (Stand 2026-05-06)

- **News:** 9 Einträge; **kein individuelles Datum** (TYPO3 Accordion ohne Datumsanzeige)
- **URL:** alle Einträge teilen dieselbe Seiten-URL (keine Einzel-URLs)

## Besonderheiten

- CMS: **TYPO3** mit Bootstrap-Accordion statt News-Liste
- Struktur: `<a href="#collapse-NNNN" class="accordion-toggle ...">Title</a>`
- News-ID: `zehdenick-news-{NNNN}` aus der `#collapse-NNNN`-Accordion-ID
- Keine individuellen Artikel-URLs: alle Items zeigen auf `/nachrichten.html`
- Kein Datum im HTML vorhanden — `fetchedAt` und `updatedAt` werden auf Abrufzeitpunkt gesetzt
- Accordion-Titel werden in jedem Lauf neu eingelesen; IDs bleiben stabil solange die Akkordeon-ID konstant ist

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 3) ausgibt
2. Falls news = 0: Prüfen ob `class="accordion-toggle"` und `href="#collapse-` noch im HTML von `/nachrichten.html` vorkommen
