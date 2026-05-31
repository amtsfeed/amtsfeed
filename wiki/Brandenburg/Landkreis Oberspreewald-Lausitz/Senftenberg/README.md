# Senftenberg

Stadt Senftenberg / ZłY Komorow im Landkreis Oberspreewald-Lausitz mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.senftenberg.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.senftenberg.de/Rathaus/Presseservice/Aktuelle-Pressemitteilungen/ |
| Events           | https://www.senftenberg.de/Bürger/Veranstaltungen/ |
| Amtsblatt        | https://www.senftenberg.de/Rathaus/Amtliche-Informationen/Amtsblätter-der-Stadt-Senftenberg.php… |
| Bekanntmachungen | https://www.senftenberg.de/Rathaus/Amtliche-Informationen/Amtliche-Bekanntmachungen/ |

## Datenqualität

- **News:** 25 Einträge (`mitteilungen clearfix`-Blöcke mit Datum)
- **Events:** 25 Einträge (`veranstaltungen clearfix`-Blöcke mit Datum)
- **Amtsblatt:** 40 Einträge (PDF-Liste `dokumente`-Blöcke, Datum aus Titel)
- **Bekanntmachungen:** 51 Einträge (PDF-Liste, kein Datum im Listing → `publishedAt = fetchedAt`)

## Besonderheiten

- CMS: **IKISS / Advantic** (Kommune-ID `2779`)
- HTML-Auslieferung in **ISO-8859-15**; im Scraper wird die Antwort als ArrayBuffer geholt und mit `TextDecoder("iso-8859-15")` dekodiert.
- News-Listing-Template (`mitteilungen clearfix`) weicht vom Hennigsdorf-IKISS-Template ab — eigene Extraktion notwendig.
- Datum aus `<div class="date"><span>DD.MM.YYYY</span></div>` (News) bzw. `<div class="date">DD.MM.YYYY</div>` (Events).
- Amtsblatt: Datum aus Titeltext `Amtsblatt_Jg._XX_Nr. N vom DD. Monat YYYY`; ältere Einträge nur mit Jahreszahl ohne genauen Tag.
- Bekanntmachungen ohne strukturiertes Veröffentlichungsdatum — Sortierung daher nicht chronologisch garantiert.
