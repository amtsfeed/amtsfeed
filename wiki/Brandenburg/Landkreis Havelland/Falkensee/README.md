# Stadt Falkensee

**CMS:** PortUNA / VerwaltungsPortal
**Website:** https://www.falkensee.de

## Quellen

| Kategorie | URL | Format |
|-----------|-----|--------|
| News | `/news/rss.xml` | RSS 2.0 |
| Veranstaltungen | `/veranstaltungen/index.php` | HTML `event-entry-new-2` |
| Amtsblatt | `/amtsblatt/index.php` | HTML-Tabelle (PDF via POST) |

## Datenqualität

- **News:** RSS-Feed liefert zuverlässig die letzten ~10 Meldungen mit `pubDate`. Titel werden vom Präfix `DD.MM.YYYY: ` befreit.
- **Events:** Datum aus URL-Pfad `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html`. Mehrere hundert Einträge inkl. wiederkehrender Veranstaltungen.
- **Amtsblatt:** Tabelle mit `Nr. N/YYYY`, Datum und PDF-Download per POST-Formular. URL verweist auf Listenseite mit Anker (`#gazette_NNNN`).

## Besonderheiten

- Bekanntmachungen-Seite `/bekanntmachungen/index.php` liefert keine Inhalte — Falkensee verteilt Bekanntmachungen offenbar über Amtsblatt + News.
- Amtsblatt-PDFs benötigen POST mit Hash-Token; daher Anker-URL statt Direkt-Download.
