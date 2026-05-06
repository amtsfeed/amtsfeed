# Leegebruch

Gemeinde im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.leegebruch.de

## Quellen

| Typ    | URL                                              |
|--------|--------------------------------------------------|
| News   | https://www.leegebruch.de/news/index.php          |
| Events | https://www.leegebruch.de/veranstaltungen/index.php |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-06 – Urlaub für Bücherwürmer  
> https://www.leegebruch.de/news/1/1231624/nachrichten/urlaub-für-bücherwürmer.html

## Datenqualität (Stand 2026-05-06)

- **News:** 2 Einträge (kleine Gemeinde, wenige Meldungen); Datum aus `<h5>DD.MM.YYYY</h5>`-Gruppen
- **Events:** 3 Einträge; Datum aus URL-Struktur `/veranstaltungen/{ID}/YYYY/MM/DD/`

## Besonderheiten

- CMS: **PortUNA** (HTML-Scraping für News und Events)
- News-Struktur: `<h5>DD.MM.YYYY</h5>` mit nachfolgenden Links `/news/1/ID/cat/slug.html`
- News-ID: `leegebruch-news-{ID}` aus zweitem Pfad-Segment nach `/news/1/`
- Events-Struktur: `<li class="tab_link_entry">` mit URL `/veranstaltungen/{ID}/YYYY/MM/DD/slug.html`
- Event-ID: `leegebruch-event-{ID}`, Startdatum direkt aus URL extrahiert

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft
2. Falls news = 0: Bei kleiner Gemeinde eventuell normal; Prüfen ob `<h5>` + `DD.MM.YYYY` im HTML vorhanden
3. Falls events = 0: Prüfen ob `tab_link_entry` und `/veranstaltungen/` noch im HTML vorkommen
