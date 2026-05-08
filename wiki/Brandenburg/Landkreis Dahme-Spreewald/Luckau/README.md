# Luckau

Stadt im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://luckau.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://luckau.de/de/buergerportal/aktuelles/aktuelle-meldungen.html |
| Amtsblatt        | https://luckau.de/de/buergerportal/amtsblaetter/archiv-ausgaben-des-luckauer-anzeigers-mit-dem-amtsblatt-fuer-die-stadt-luckau/artikel-ausgaben-des-luckauer-lokalanzeigers-amtsblattes-2026.html (+ 2025) |
| Bekanntmachungen | https://luckau.de/de/buergerportal/buergerservice-formulare/oeffentliche-bekanntmachungen.html |

## Datenqualität

- **News:** 13 Einträge, Datum aus `<span class="dateText">DD.MM.YYYY</span>` in `<article id="article_SLUG">`
- **Amtsblatt:** 16 Einträge, Datum aus zweiter Tabellenspalte (Amtsblatt-Spalte) — zwei Jahresseiten (2025, 2026) werden zusammengeführt
- **Bekanntmachungen:** 43 Einträge, Datum aus erster Tabellenspalte in Accordion-Tabelle
- **Events:** nicht vorhanden

## Besonderheiten

- CMS: **Sitepark**
- Amtsblatt erscheint zusammen mit dem "Luckauer Lokalanzeiger" in einer Tabelle; nur die zweite Spalte (Amtsblatt) wird ausgewertet
- Amtsblatt: pro Jahr eine eigene URL; derzeit 2025 und 2026 werden abgerufen
- www.luckau.de leitet auf luckau.de (ohne www) um
- Bekanntmachungen in Accordion-Struktur; Datum wird aus Zelle 0 gelesen und für folgende Zeilen ohne explizites Datum weiterverwendet
