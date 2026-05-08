# Stahnsdorf

Gemeinde Stahnsdorf mit News, Veranstaltungen und Amtsblatt.
Quelle: https://stahnsdorf.de

## Quellen

| Typ       | URL |
|-----------|-----|
| News      | https://stahnsdorf.de/aktuell-informativ/ |
| Events    | https://stahnsdorf.de/aktuell-informativ/veranstaltungen/veranstaltungskalender/ |
| Amtsblatt | https://ratsinfo-online.net/stahnsdorf-bi/filelist.asp?id=1 |

## Datenqualität

- **News:** 6 Einträge
- **Events:** 31 Einträge
- **Amtsblatt:** 10 Einträge
- **Bekanntmachungen:** nicht vorhanden

## Besonderheiten

- CMS: **Individuell** (eigenes CMS auf stahnsdorf.de)
- Amtsblatt aus externem **RatsInfo-Online**-System (ratsinfo-online.net/stahnsdorf-bi), Dateinamen-Parsing: `Nr.NN Jahrgang YY am DD.MM.YYYY`
- Events aus HTML-Kalender mit `data-year`/`data-month`-Tabellen und `paragraphcalenderevent`-IDs
- News-Datum wird rückwärts im HTML gesucht (nearest `<h3>` vor Datums-Match)
- Amtsblatt auch aus Archiv-Unterordnern des Vorjahres bezogen; Latin-1-Dekodierung
