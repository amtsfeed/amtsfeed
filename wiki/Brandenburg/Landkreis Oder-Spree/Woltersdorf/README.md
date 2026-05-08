# Woltersdorf

Gemeinde im Landkreis Oder-Spree mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.woltersdorf-schleuse.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.woltersdorf-schleuse.de/news/index.php?rubrik=1 |
| Events           | https://www.woltersdorf-schleuse.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.woltersdorf-schleuse.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.woltersdorf-schleuse.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 13 Einträge
- **Events:** 20 Einträge
- **Amtsblatt:** 68 Einträge
- **Bekanntmachungen:** 191 Einträge

## Besonderheiten

- CMS: **Verwaltungsportal**
- Events im `event-box`-Format: Datum aus URL-Pfad, Uhrzeit aus `<time>` Tag
- News im `news-entry-new-4`-Format mit deutschem Langdatum (`DD. Monat YYYY`)
- Bekanntmachungen-Deduplizierung per PDF-URL; IDs werden stabil nach `publishedAt` neu nummeriert
