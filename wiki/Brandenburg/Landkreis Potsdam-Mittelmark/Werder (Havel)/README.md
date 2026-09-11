# Werder (Havel)

Stadt Werder (Havel) mit News, Veranstaltungen und Bekanntmachungen.
Quelle: https://www.werder-havel.de

**CMS:** WordPress (Divi-Theme, WP File Download) — seit 2026; vorher Joomla mit com_form2content

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.werder-havel.de/category/neuigkeiten/ (3 Seiten) |
| Events           | https://www.werder-havel.de/freizeit-tourismus/event-kalender/ |
| Bekanntmachungen | https://www.werder-havel.de/politik-rathaus/stadtverwaltung/bekanntmachungen/ |

## Besonderheiten

- **Relaunch 2026:** Sämtliche alten Joomla-Pfade (`/politik-rathaus/aktuelles/neuigkeiten.html`,
  `/service/ortsrecht-werder/…`) liefern 404. Die Altbestände in den JSON-Dateien bleiben erhalten,
  ihre URLs zeigen allerdings ins Leere.
- **Keine REST-API:** robots.txt sperrt mit `Disallow: /*?*` alle URLs mit Query-String — damit auch
  `/wp-json/…?per_page=…`. Deshalb werden bewusst die query-freien Übersichtsseiten geparst.
- **Kein eigenes Amtsblatt mehr:** Die früher unter `amtsblatt.json` gesammelten PDFs waren
  Bekanntmachungen. `amtsblatt.json` bleibt als Archiv bestehen, wird aber nicht fortgeschrieben.
- **News:** Divi-Markup, `<article id="post-NNNNN">` mit `<h2 class="entry-title">` und
  `<span class="published">10. September 2026</span>`. Pro Seite nur 6 Beiträge, daher werden drei
  Seiten geholt — das deckt auch mehrtägige Ausfälle ab.
- **Events:** Markup wie vor dem Relaunch (`event__title`, `subhead`, `event-ort`), nur unter neuem
  Pfad; die `eventid`-Nummern sind stabil geblieben, die Event-IDs bleiben damit gültig.
- **Bekanntmachungen:** WP File Download, `<div class="file pdf" data-id="NNN">` mit
  `<span class="f_title">` und `Datum hinzugefügt: DD.MM.YYYY`.

## ID-Konvention

- `werder-havel-news-{post-id}` (WordPress-Post-ID; Altbestand nutzt Joomla-IDs)
- `werder-havel-event-{eventid}`
- `werder-notice-{file-id}` (WP-File-Download-ID; Altbestand nutzt Joomla-`f<ID>`)

## Validierung

Das Scraping funktioniert noch, wenn `pnpm tsx index.ts` ohne Fehler läuft und alle drei Kategorien
Einträge melden (news ≥ 15, events ≥ 50, notices ≥ 50 pro Lauf neu geparst).
