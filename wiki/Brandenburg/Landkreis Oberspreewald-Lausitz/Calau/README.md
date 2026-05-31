# Calau

Stadt Calau im Landkreis Oberspreewald-Lausitz mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.calau.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.calau.de/news/index.php?rubrik=1 |
| Events           | https://www.calau.de/veranstaltungen/index.php |
| Amtsblatt        | https://www.calau.de/amtsblatt/index.php |
| Bekanntmachungen | https://www.calau.de/bekanntmachungen/index.php |

## Datenqualität

- **News:** 20 Einträge (Titel, URL, Datum aus Listing-Kontext)
- **Events:** 116 Einträge (Titel, URL, Datum aus URL-Pfad)
- **Amtsblatt:** 55 Einträge (Tabelle mit `Nr. NN[a]/YYYY`-Spalten)
- **Bekanntmachungen:** 4 Einträge

## Besonderheiten

- CMS: **PortUNA** (verwaltungsportal.de-Layout, eigene Domain)
- Bekanntmachungen-Format: `<tr valign="top"><td class="table-title">DD.MM.YYYY</td><td width="66%">Titel</td><td>...PDF-Link...</td></tr>` (abweichend vom Standard `<td valign="top">`)
- Amtsblatt-Nummer kann Suffix-Buchstaben enthalten (z.B. `Nr. 5a/2026`)
