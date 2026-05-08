# Amt Schlaubetal

Amt im Landkreis Oder-Spree mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.amt-schlaubetal.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.amt-schlaubetal.de/news/1 |
| Events           | https://www.amt-schlaubetal.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.amt-schlaubetal.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.amt-schlaubetal.de/seite/598017/aktuelle-bekanntmachungen.html |

## Datenqualität

- **News:** 15 Einträge
- **Events:** 4 Einträge
- **Amtsblatt:** 181 Einträge
- **Bekanntmachungen:** 9 Einträge

## Besonderheiten

- CMS: **PortUNA (Verwaltungsportal)**
- Bekanntmachungen als Links auf `daten2.verwaltungsportal.de` PDFs (keine strukturierten Datumsangaben — `fetchedAt` wird als `publishedAt` verwendet)
- Amtsblatt ohne `<time datetime>` Attribut; Fallback auf 1. Januar des jeweiligen Jahres
- News im `news-entry-new-4`-Format (`news-entry-to-limit`)
