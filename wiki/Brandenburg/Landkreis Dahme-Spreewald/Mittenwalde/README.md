# Mittenwalde

Stadt im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.mittenwalde.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://www.mittenwalde.de/de/verwaltung-wirtschaft/aktuelles/aus-der-stadt |
| Events | https://www.mittenwalde.de/de/service-wie-was-wo/kalender/veranstaltungskalender |

## Datenqualität

- **News:** 18 Einträge, Datum aus `<time datetime="YYYY-MM-DD">` in `<span class="news-list-date">`
- **Events:** 9 Einträge, Datum aus `<p class="date">DD.MM.YYYY</p>` in `<div class="termin">`
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **TYPO3** (tx_news)
- News: Artikel in `<div class="row with-keywords ...">`, Titel in `<b>`, Beschreibung in `<div itemprop="description">`
- Events: eigenes Widget `mwwidgets_terminliste`; `<div class="termin">` mit optionaler Endzeit und Beschreibung; keine Einzelseiten-URLs — alle Events verweisen auf die Kalenderseite
- Event-IDs werden aus Startdatum + slugifiziertem Titel gebildet
