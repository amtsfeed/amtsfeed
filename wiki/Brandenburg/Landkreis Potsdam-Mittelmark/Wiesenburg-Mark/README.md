# Wiesenburg-Mark

Gemeinde Wiesenburg/Mark mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.wiesenburgmark.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.wiesenburgmark.de/news/index.php?rubrik=1 |
| Events           | https://www.wiesenburgmark.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.wiesenburgmark.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.wiesenburgmark.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 10 Einträge
- **Events:** 80 Einträge
- **Amtsblatt:** 189 Einträge
- **Bekanntmachungen:** 105 Einträge

## Besonderheiten

- CMS: **Verwaltungsportal.de** (PortUNA-Layout)
- Bekanntmachungen: zweispaltige Tabelle mit `valign="top"`, PDFs auf daten.verwaltungsportal.de unter `/publicizing/`-Pfad
- ID-Generierung aus numerischen Pfadsegmenten der publicizing-URL (z. B. `/publicizing/9/3/4/7/6/` → `93476`)
- Amtsblatt-Parsing per Regex auf `Nr. NN/YYYY`-Tabellenformat
