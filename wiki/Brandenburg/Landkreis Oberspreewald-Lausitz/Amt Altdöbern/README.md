# Amt Altdöbern

- **Website:** https://www.amt-altdoebern.de
- **CMS:** PortUNA (verwaltungsportal.de)
- **Landkreis:** Oberspreewald-Lausitz, Brandenburg
- **Mitgliedsgemeinden:** Altdöbern, Bronkow, Luckaitztal, Neu-Seeland, Neupetershain

## Datenquellen

| Quelle      | URL                                  | Felder                                                  |
|-------------|--------------------------------------|---------------------------------------------------------|
| News        | `/news/1`                            | Titel, URL, `publishedAt` (DD.MM.YYYY aus Vorschau), Beschreibung |
| Events      | `/veranstaltungen/index.php`         | Titel, URL, Start (Datum + Uhrzeit), Ort, Beschreibung  |
| Amtsblatt   | `/amtsblatt/index.php`               | Nr./Jahrgang, Erscheinungsdatum                         |

## Besonderheiten

- Standard-PortUNA `event-box`-Template — Events bringen Uhrzeit (`<time>HH:MM</time>`) und
  Ort/Info-Felder direkt mit.
- News-Titel liegen im PortUNA-Layout dieses Amtes in `<h4 class="h4link">` (nicht `<h3>`); der
  Scraper akzeptiert beide.
- `/bekanntmachungen/index.php` enthält keine strukturierte Datumsliste — daher kein
  `notices.json`.

## ID-Konvention

- `altdoebern-event-{portuna-id}`
- `altdoebern-news-{portuna-id}`
- `altdoebern-amtsblatt-{YYYY}-{NN}`
