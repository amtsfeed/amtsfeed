# Seddiner See

Gemeinde Seddiner See mit News, Veranstaltungen (JSON-API) und Amtsblatt.
Quelle: https://www.seddiner-see.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://www.seddiner-see.de/ |
| Events    | https://www.seddiner-see.de/api/calendar/event?filter[category]=2&... |
| Amtsblatt | https://www.seddiner-see.de/gemeinde/amtsblatt |

## Datenqualität

- **News:** 30 Einträge
- **Events:** 28 Einträge
- **Amtsblatt:** 42 Einträge
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **Individuell** (proprietäres CMS mit eingebetteten JavaScript-Listing-Objekten)
- News und Amtsblatt werden aus einem eingebetteten JS-Objekt (`var $listing_1 = {...}`) auf der Seite extrahiert
- Events kommen aus einer REST-JSON-API (`/api/calendar/event`)
- Amtsblatt-Einträge im Format `DD.MM.YYYY - Beschreibung`
