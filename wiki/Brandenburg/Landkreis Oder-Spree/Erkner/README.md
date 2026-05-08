# Erkner

Stadt im Landkreis Oder-Spree mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.erkner.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.erkner.de/rathaus-und-buergerservice/buergerinformationen/aktuelles.html |
| Events           | https://www.erkner.de/freizeit-und-tourismus/stadtgeschichte-und-kultur/veranstaltungskalender.html |
| Amtsblatt        | https://www.erkner.de/rathaus-und-buergerservice/buergerinformationen/amtsblatt.html |
| Bekanntmachungen | https://www.erkner.de/rathaus-und-buergerservice/buergerinformationen/bekanntmachungen.html |

## Datenqualität

- **News:** 382 Einträge
- **Events:** 81 Einträge
- **Amtsblatt:** 5 Einträge
- **Bekanntmachungen:** 17 Einträge

## Besonderheiten

- CMS: **Neos CMS**
- Events werden als HTML-entity-codiertes JSON im `data-events` Attribut eingebettet
- Bekanntmachungen nach Referenznummern (`NNI YYYY`) in `<h3>` gruppiert, Download-Links per UUID identifiziert
- Amtsblatt-Muster: `Amtsblatt NI2026` (Nummer + `I` + Jahr)
