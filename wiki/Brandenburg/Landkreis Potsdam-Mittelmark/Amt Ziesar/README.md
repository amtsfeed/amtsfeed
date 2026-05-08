# Amt Ziesar

Gemeindeverwaltung des Amtes Ziesar mit News, Amtsblatt und Bekanntmachungen.
Quelle: https://www.amt-ziesar.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.amt-ziesar.de/aktuelles.html |
| Amtsblatt        | https://www.amt-ziesar.de (Joomla com_dropfiles API, Kategorie 59) |
| Bekanntmachungen | https://www.amt-ziesar.de/service/bekanntmachungen.html |

## Datenqualität

- **News:** 25 Einträge
- **Events:** nicht vorhanden
- **Amtsblatt:** 17 Einträge
- **Bekanntmachungen:** 32 Einträge

## Besonderheiten

- CMS: **Joomla** mit com_dropfiles für Amtsblatt
- Amtsblatt wird per JSON-API bezogen (`com_dropfiles`, die letzten 2 Jahres-Kategorien unter Root-ID 59)
- Bekanntmachungen: Joomla-Blog-Layout, Datum aus Slug-Präfix `DD-MM-YYYY-`
- Kein Veranstaltungs-Scraper vorhanden
