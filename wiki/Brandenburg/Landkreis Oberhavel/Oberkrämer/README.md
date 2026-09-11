# Oberkrämer

Gemeinde im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.oberkraemer.de

**CMS:** Portuna / verwaltungsportal.de (seit 2026; vorher TYPO3) — dieselbe Plattform wie
Calau, Großräschen, Lauchhammer und weitere Quellen im Datenbestand.

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.oberkraemer.de/news/index.php |
| Veranstaltungen  | https://www.oberkraemer.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.oberkraemer.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.oberkraemer.de/bekanntmachungen/index.php |

## Besonderheiten

- **Relaunch 2026:** Die TYPO3-Pfade (`/artikel-ansicht/show/…`, `/buergerservice/downloads/amtsblatt/`)
  existieren nicht mehr. Der Altbestand bleibt als Archiv in den JSON-Dateien, seine URLs sind tot.
- **Neu: Veranstaltungen und Amtsblatt.** Vorher gab es nur News und einen PDF-Amtsblattordner.
- Portuna schreibt Datumsangaben mit eingestreuten Zero-Width-Spaces (`08.&#8203;09.&#8203;2026`) —
  vor dem Parsen werden Entities dekodiert und Whitespace entfernt.
- **News:** Archivansicht, ein `<div class="row entry">` pro Tag mit `<h3 class="title_archive_…">`
  als Datum und darin einer `<li><a href="/news/{rubrik}/{id}/…">`-Liste.
- **Amtsblatt:** `<article class="gazette-tab">` mit `<time datetime="YYYY-MM-DD">`. Der Download
  läuft über ein POST-Formular, es gibt also keinen direkten PDF-Link — verlinkt wird der Anker
  `#gazette_{id}` auf der Amtsblattseite.
- **Bekanntmachungen:** Tabelle "Veröffentlicht am / Titel"; das PDF liegt auf
  `daten.verwaltungsportal.de`, verlinkt wird die Detailseite `/bekanntmachung/{id}/…`.

## ID-Konvention

- `oberkraemer-news-{news-id}`
- `oberkraemer-event-{event-id}`
- `oberkraemer-amtsblatt-{gazette-id}`
- `oberkraemer-notice-{bekanntmachungs-id}`

## Validierung

Das Scraping funktioniert noch, wenn `pnpm tsx index.ts` ohne Fehler läuft und alle vier Kategorien
Einträge melden. Falls eine Kategorie leer bleibt: prüfen, ob das jeweilige Portuna-Markup
(`row entry`, `/veranstaltungen/{id}/{YYYY}/{MM}/{DD}/`, `gazette-tab`, `<td valign="top">`)
noch im HTML vorkommt.
