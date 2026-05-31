# Stadt Nauen

**CMS:** LivingData komXcms
**Website:** https://www.nauen.de

## Quellen

| Kategorie | URL | Format |
|-----------|-----|--------|
| News (Amtliche Mitteilungen) | `/meta/amtliche-mitteilungen/` (+ `?page=N`) | HTML `card news-item-item` |
| Veranstaltungen | `/leben-arbeiten/kultur/veranstaltungskalender/` | HTML `events-item` mit Schema.org-Markup |
| Amtsblatt | `/politik-verwaltung/amtsblatt/` | HTML `documents-item` mit PDF-Links |

## Datenqualität

- **News:** Listenseite enthält Titel (`<h4>`), Datum als deutscher Langform-Text (`<span class="font-weight-bold">29. Mai 2026:</span>`) und URL. Paginierung über `?page=N` (bis Seite leer oder keine neuen IDs). Default-Limit: 20 Seiten.
- **Events:** ISO-Datum direkt aus `<time itemprop="startDate" datetime="...">`, Ort aus `<span itemprop="name">`. Composite-ID `{slug}-{YYYYMMDD}` für wiederkehrende Termine.
- **Amtsblatt:** Titel im Format `Nr. N_YYYY_Erscheinungstag DD. Monat YYYY` — Nummer/Jahr und Erscheinungsdatum werden per Regex extrahiert. PDF-URL direkt im `href`.

## Besonderheiten

- LivingData komXcms verwendet das Schema.org-Microdata-Vokabular für Events — daher sind `startDate`, `endDate` und Location maschinenlesbar.
- Bekanntmachungen werden bei Nauen unter „Amtliche Mitteilungen" geführt — identisch mit News, daher kein separates `notices.json`.
- Amtsblatt-Dateinamen variieren stark (`nauen2617.pdf`, `nr-1_25-februar-2026.pdf`), aber der Titeltext ist konsistent.
