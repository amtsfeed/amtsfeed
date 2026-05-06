# Kremmen

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.kremmen.de

## Quellen

| Typ    | URL                                          |
|--------|----------------------------------------------|
| News   | https://www.kremmen.de/news/index.php         |
| Events | https://www.kremmen.de/veranstaltungen/index.php |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-03 – Kremmen läuft 2026  
> https://www.kremmen.de/news/2/1230865/sport/kremmen-läuft-2026.html

## Datenqualität (Stand 2026-05-06)

- **News:** 11 Einträge; Datum aus `<h2 class='legacy_h5'>DD.MM.YYYY</h2>`-Gruppen im HTML
- **Events:** 47 Einträge; Datum aus `datetime`-Attribut im `events-entry-3`-Block

## Besonderheiten

- CMS: **PortUNA** (HTML-Scraping für News und Events)
- News-Struktur: Datums-Überschriften `<h[2-6]>DD.MM.YYYY</h[2-6]>` mit nachfolgenden Artikel-Links `/news/N/ID/cat/slug.html`
- News-ID: `kremmen-news-{ID}` aus dem zweiten Pfad-Segment nach `/news/N/`
- PortUNA verwendet `&#8203;` (Zero-Width-Space) zwischen Ziffern — wird vor dem Parsen entfernt
- Events-Struktur: `<div class="row events-entry-3">` mit `datetime`-Attribut + `<p class="events-entry-3-location">`
- Event-ID: `kremmen-event-{ID}` aus `/veranstaltungen/{ID}/`-URL

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) ausgibt
2. `events: N Einträge` (N ≥ 5) ausgibt
3. Falls news = 0: Prüfen ob `<h` + `DD.MM.YYYY` + `/news/` noch im HTML vorkommen
4. Falls events = 0: Prüfen ob `events-entry-3` und `/veranstaltungen/` noch vorkommen
