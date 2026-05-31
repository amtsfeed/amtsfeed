# Großräschen

Stadt Großräschen im Landkreis Oberspreewald-Lausitz mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.grossraeschen.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.grossraeschen.de/news/index.php?rubrik=1 |
| Events           | https://www.grossraeschen.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.grossraeschen.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.grossraeschen.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge
- **Events:** 47 Einträge
- **Amtsblatt:** 235 Einträge (Archiv ab 2003 in `<details>`-Accordion pro Jahr)
- **Bekanntmachungen:** 0 Einträge (`announcement-view` Container ist leer)

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de-Layout)
- **Amtsblatt:** Standard PortUNA `gazette-tab`-Variante. Container `<article class="gazette-tab">` mit `<h3>Ausgabe Nr. N/YYYY</h3>` und `<time datetime="YYYY-MM-DD">`. PDFs werden nur per POST-Formular mit Hash ausgeliefert; URL = Listenseite mit `#gazette_{ID}`-Anker.
- Bekanntmachungen werden auf der Stadtwebsite aktuell nicht digital ausgegeben — die Liste ist systemseitig vorhanden, aber ohne Einträge.
