# Zeuthen

Gemeinde im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://www.zeuthen.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.zeuthen.de/sitemap.xml (Artikel-URLs), Einzelseiten mit `class="artdate"` |
| Amtsblatt | https://www.zeuthen.de/amtsblatt |

## Datenqualität

- **News:** 8 Einträge, Datum aus `class="artdate">DD.MM.YYYY` auf den jeweiligen Artikelseiten
- **Amtsblatt:** 169 Einträge, Datum aus PDF-Dateinamen (`Amtsblatt-YYYY-MM-NNNNNN.pdf`)
- **Events:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **maXvis v4**
- News-Listenseite (`/meldungen`) lädt Inhalte per AJAX — nicht direkt scrapbar; stattdessen wird die Sitemap (`sitemap.xml`) nach Artikel-URLs (ID ≥ 700000) durchsucht
- Nur neue (noch unbekannte) Artikel-URLs werden abgerufen (max. 20 pro Lauf, in Batches à 5)
- Artikel gelten als News, wenn sie `t_ris_news` enthalten oder ein `artdate`-Element haben
- Amtsblatt enthält auch "Am Zeuthener See"-Zeitung, diese wird gefiltert (nur `Amtsblatt-*.pdf`)
- Amtsblatt-PDFs liegen direkt im Root-Verzeichnis (`https://www.zeuthen.de/Amtsblatt-YYYY-MM-ID.pdf`)
