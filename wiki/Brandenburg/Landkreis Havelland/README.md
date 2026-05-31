# Landkreis Havelland

**Quelle:** [havelland.de](https://www.havelland.de/)

**CMS:** TYPO3 (EXT:news für Pressemitteilungen, statische Seiten für Amtsblätter)

| Inhaltstyp | URL |
|------------|-----|
| News (Pressemitteilungen) | https://www.havelland.de/landkreis-verwaltung/presse/pressemitteilungen/ |
| Amtsblatt (aktuelles Jahr) | https://www.havelland.de/landkreis-verwaltung/presse/amtsblaetter-2026/ |
| Amtsblatt (Vorjahre) | `…/amtsblaetter-{2025,2024}/` |
| Amtsblatt (2023) | https://www.havelland.de/landkreis-verwaltung/presse/amtsblatt/2023/ |
| Amtsblatt (Archiv 2000–2022) | `…/amtsblatt/archiv/amtsblaetter-{YYYY}/` |

## Besonderheiten

- **News-Pagination:** Listenseite enthält Pagination-Links `…/page/N/`. Der Scraper liest die Startseite, ermittelt den höchsten verlinkten `page`-Wert (Stand 2026-05-31: 11) und holt alle weiteren Seiten parallel.
- **News-Datum:** Steht als deutscher Langtext (z.B. „29. Mai 2026") im `<h4>` direkt vor dem Titel-Link. Monatsname-Mapping in `MONTHS`.
- **News-Container:** `<div class="c-news-list__item">` mit Folge-`__item--even` für ungerade/gerade Zeilen.
- **News-URL-Struktur:** `/landkreis-verwaltung/presse/pressemitteilungen/einzelansicht/news/detail/article/{slug}/` — Slug = ID.
- **Amtsblatt-Verzeichnis-Wechsel:** Bis 2022 liegen die Jahres-Listenseiten unter `/landkreis-verwaltung/presse/amtsblatt/archiv/amtsblaetter-YYYY/`, 2023 ist ein Übergangsjahr mit eigener Sonder-URL `…/amtsblatt/2023/`, ab 2024 dann unter `…/amtsblaetter-YYYY/` direkt.
- **Amtsblatt-Linktext:** `Amtsblatt NN/YYYY (DD. Monat)` bzw. `Sonderamtsblatt NN/YYYY (DD. Monat YYYY)`. Datum wird aus dem Linktext geparst; Jahr fällt auf `issueYear` zurück, wenn im Datum fehlt.
- **PDF-Pfade:** unterschiedliche Verzeichnisse je nach Alter (`/fileadmin/dateien/landrat/amtsblaetter/YYYY/...` oder `/fileadmin/dateien/landrat/Presse/YYYY/PDF/...`) — Scraper macht keine Pfad-Annahmen, nimmt jedes `<a href="*.pdf">` mit „Amtsblatt" im Text.
- **Events:** Der Landkreis betreibt keine eigene Veranstaltungsrubrik (`/presse/veranstaltungen/` ⇒ 404). Veranstaltungen erscheinen ausschließlich auf Ebene der Gemeinden.

## Datenqualität

| Kategorie | Anzahl beim Erstabruf |
|-----------|-----------------------|
| News | 105 (11 Seiten × ~10) |
| Amtsblatt | 443 (Sonderausgaben + reguläre, 2000 – aktuell) |
