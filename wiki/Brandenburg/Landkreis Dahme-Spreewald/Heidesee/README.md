# Heidesee

Gemeinde im Landkreis Dahme-Spreewald, Brandenburg.
Quelle: https://gemeinde-heidesee.de

## Quellen

| Typ    | URL |
|--------|-----|
| News   | https://gemeinde-heidesee.de/allgemeine-informationen/aktuelles?format=feed&type=rss |
| Events | https://gemeinde-heidesee.de/freizeit-und-tourismus-main/veranstaltungen-main |

## Datenqualität

- **News:** 9 Einträge, Datum aus `<pubDate>` im RSS-Feed (RFC 822)
- **Events:** 11 Einträge, Datum aus Dateiname der eingebetteten Poster-Bilder (`YYYYMMDD_TitelWörter-hash.webp`)
- **Amtsblatt:** nicht vorhanden
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **Joomla** (UIkit-Theme)
- News via Joomla-RSS-Feed (`?format=feed&type=rss`), CDATA-Blöcke in Titeln und Beschreibungen
- Events-Seite hat keine strukturierten Event-Daten — Datum und Titel werden aus den Dateinamen der Veranstaltungs-Poster-Bilder im YOOtheme-Cache extrahiert (`/templates/yootheme/cache/…/YYYYMMDD_Title-hash.webp`)
- Event-URL zeigt stets auf die allgemeine Veranstaltungsseite (keine Einzelseiten)
- Titelrekonstruktion aus Dateinamen: ASCII-Umlaute (Fruehling → Frühling) werden heuristisch zurückgewandelt
