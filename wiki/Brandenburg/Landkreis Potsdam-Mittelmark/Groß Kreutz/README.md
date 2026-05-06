# Groß Kreutz (Havel)

Gemeinde im Landkreis Potsdam-Mittelmark, Brandenburg.
Quelle: https://www.gross-kreutz.de

## Quellen

| Typ       | URL                                                              |
|-----------|------------------------------------------------------------------|
| News      | https://www.gross-kreutz.de/news.html                           |
| Events    | https://www.gross-kreutz.de/gemeinde/aktuelle-veranstaltungen-termine.html |
| Amtsblatt | Joomla com_dropfiles API, Root-Kategorie 386                    |

## Beispiele (Stand Einrichtung 2026-05-06)

**Amtsblatt:**
> Amtsblatt 2026-04  
> https://www.gross-kreutz.de/dateien/473/2026/665/Amtsblatt-2026-04

## Datenqualität (Stand 2026-05-06)

- **News:** 0 Einträge beim letzten Lauf (Scraper läuft fehlerfrei, aber News-Seite liefert ggf. kein passendes `class="news-item"`-Muster).
- **Events:** 31 Einträge; Datum aus dem HTML-Kontext um den Link herum, kein strukturiertes Datum-Element.
- **Amtsblatt:** 17 Einträge (aktuell + Vorjahr via Joomla com_dropfiles API). Titel: `Amtsblatt YYYY-MM`; `publishedAt` aus Titelformat.

## Besonderheiten

- CMS: **Joomla** (Custom CMS für News/Events; com_dropfiles für Amtsblatt)
- Amtsblatt: Joomla com_dropfiles API
  - Kategorien: `GET /index.php?option=com_dropfiles&view=frontcategories&format=json&id=386&top=386` → Jahr-Unterkategorien (`title` = 4-stellige Jahreszahl)
  - Dateien: `GET /index.php?option=com_dropfiles&view=frontfiles&format=json&id={CATID}` → `id`, `title`, `created_time` (DD-MM-YYYY), `link`
  - Datei-Titel: `Amtsblatt YYYY-MM` → `publishedAt` aus Titelformat (Jahr + Monat)
  - ID: `gross-kreutz-amtsblatt-{Joomla-File-ID}`
- Events: URL-Muster `/gemeinde/aktuelle-veranstaltungen-termine/{ID}-{slug}.html`; Datum aus HTML-Kontext (kein `<time>`-Element)
- News-Container: `class="news-item"` mit `class="news-date"` und `<h3>` — bei 0 Einträgen prüfen ob das Muster noch stimmt

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `amtsblatt: N Einträge` (N ≥ 5) ausgibt
2. Falls amtsblatt = 0: Prüfen ob `GET /index.php?option=com_dropfiles&view=frontcategories&format=json&id=386&top=386` noch Jahr-Kategorien liefert
3. Falls news = 0: Prüfen ob die Seite noch `class="news-item"` enthält
