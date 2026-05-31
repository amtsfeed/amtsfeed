# Amt Rhinow

Amt im Landkreis Havelland, Brandenburg.
Quelle: https://www.rhinow.de  (Hinweis: `amt-rhinow.de` existiert **nicht** — die Amtsverwaltung publiziert unter der Domain der Stadt Rhinow.)

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.rhinow.de/news/1 |
| Events           | https://www.rhinow.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.rhinow.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.rhinow.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge, Datum aus Vorschau-Präfix `<p class="vorschau">DD.MM.YYYY: ...` (kein dedizierter Datums-Container)
- **Events:** ~24 Einträge, Datum aus URL-Muster `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`
- **Amtsblatt:** ~85 Einträge, Datum aus Tabellenzeile `<td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>`
- **Bekanntmachungen:** ~60 Einträge, Datum + Titel + Direkt-PDF-Link in pro Bekanntmachung eigener `<table class="break-word">`

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de) — älteres Theme als Friesack/Nennhausen (eigenes `style.css`/`div.css`)
- Domain ist `rhinow.de`, nicht `amt-rhinow.de`
- News-Listenansicht hat **keinen** `news-entry-new-2-date`-Div — Datum ist als Klartext-Präfix im Vorschau-Absatz codiert
- Amtsblatt-PDFs erfordern POST-Request mit `hash` — URL zeigt auf Listing-Seite mit Anker `#gazette_ID`
- Bekanntmachungen sind nicht in einer einzigen großen Tabelle, sondern in mehreren `<table class="break-word">` (eine pro Eintrag, gruppiert nach Jahr) — alle Tabellen werden eingesammelt
