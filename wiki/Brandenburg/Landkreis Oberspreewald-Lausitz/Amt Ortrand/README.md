# Amt Ortrand

- **Website:** https://www.amt-ortrand.de
- **CMS:** Joomla! (com_content blog category) + JEvents 3.6
- **Landkreis:** Oberspreewald-Lausitz, Brandenburg
- **Mitgliedsgemeinden:** Ortrand, Frauendorf, Großkmehlen, Kroppen, Lindenau, Tettau

## Datenquellen

| Quelle      | URL                                                   | Felder                                                    |
|-------------|-------------------------------------------------------|-----------------------------------------------------------|
| News        | `/` (Joomla-Blog auf der Startseite)                  | Titel (`<h2 class="article-title">`), URL (`meta itemprop="url"`), `publishedAt` (`<time datetime>`) |
| Events      | `/veranstaltungen` (JEvents Accordion)                | Titel, Datum (parsed aus "DD. Monat YYYY")                |
| Amtsblatt   | `/downloads/amtsblätter`                              | Nr./Jahrgang, Erscheinungsdatum, direkter PDF-Link        |

## Besonderheiten

- Die "News" der Startseite sind ein Joomla-Blog mit Featured Articles. Es gibt keinen separaten
  News-Bereich; der Scraper parst die Artikel der Kategorie-View.
- JEvents-Listing zeigt nur Datum + Titel in einem Bootstrap-Accordion — pro Event gibt es **keinen
  Detail-URL** in der Listing-Markup. `event.url` zeigt daher auf die Listing-Seite. IDs werden aus
  `{slug-aus-titel}-{YYYY-MM-DD}` gebildet.
- Es gibt einen JEvents RSS-Feed unter
  `/index.php?option=com_jevents&task=modlatest.rss&format=feed&type=rss&Itemid=535&modid=0` — dieser
  enthält allerdings nur die nächste(n) Veranstaltung(en) und wurde daher nicht verwendet.
- Amtsblatt-PDFs liegen unter `/images/Amtsblaeter/{YYYY}/`. Dateinamen folgen meistens
  `Amtsblatt_Nr._N_-_Monat_YYYY_-_DD.MM.YYYY.pdf` (Datum exakt), für 2026 wurden teils
  Sonderbenennungen wie `Mai_2026_Siegel.pdf` verwendet (Datum = Monatserster als Fallback).
- Die Kategorieseite zeigt teils nicht-amtliche Beiträge (KI-generierte Versuche im HTML
  gefunden). Inhalte werden 1:1 übernommen — gefiltert wird nicht.
- Keine strukturierte Liste öffentlicher Bekanntmachungen, daher kein `notices.json`.

## ID-Konvention

- `ortrand-news-{slug}` (Slug = letzter Pfad-Teil der Artikel-URL)
- `ortrand-event-{YYYY-MM-DD}-{slug}`
- `ortrand-amtsblatt-{YYYY}-{NN-oder-Datum}`
