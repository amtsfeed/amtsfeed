# Friedersdorf

Dorf mit Kunstspeicher im Amt Seelow-Land (Landkreis Märkisch-Oderland) — nur Events werden gescrapt.
Quelle: https://www.kunstspeicher-friedersdorf.de

## Quellen

| Typ    | URL |
|--------|-----|
| Events | https://www.kunstspeicher-friedersdorf.de/veranstaltungen/index.php |

## Datenqualität

- **News:** nicht vorhanden
- **Events:** 5 Einträge
- **Amtsblatt:** nicht vorhanden

## Besonderheiten

- CMS: **PortUNA (Verwaltungsportal)**
- Scrapt zwei Seiten: allgemeine Veranstaltungen (`/veranstaltungen/index.php`) und Ausstellungen (`rubrik.php?nummer=5`)
- Events im `events-entry-3`-Format; Ausstellungen haben Start- und Enddatum (zwei `<time>` Tags)
- IDs werden mit Präfix `ev-` (Events) bzw. `exh-` (Ausstellungen) unterschieden
