# Stadt Premnitz

**CMS:** PortUNA / VerwaltungsPortal
**Website:** https://www.premnitz.de

## Quellen

| Kategorie | URL | Format |
|-----------|-----|--------|
| News | `/news/rss.xml` | RSS 2.0 |
| Veranstaltungen | `/veranstaltungen/index.php` | HTML, Datum aus URL |
| Bekanntmachungen | `/bekanntmachungen/index.php` | PortUNA-Tabelle `<td valign="top">DD.MM.YYYY</td>` + PDF auf `daten.verwaltungsportal.de` |

## Datenqualität

- **News:** RSS-Feed liefert ~20 letzte Meldungen mit `pubDate`. Auf der HTML-Listenseite (`news-entry-new-4`) fehlt das Datum bei den meisten Einträgen, daher ist der RSS-Feed die einzige zuverlässige Datumsquelle.
- **Events:** Sehr aktiver Kalender mit hunderten Einträgen, Datum aus URL-Pfad.
- **Bekanntmachungen:** ~300 Einträge, PDFs liegen auf `daten.verwaltungsportal.de/dateien//publicizing/...`.

## Besonderheiten

- **Amtsblatt:** Premnitz pflegt **kein** eigenes Amtsblatt. Alle amtlichen Mitteilungen erscheinen ausschließlich als Bekanntmachungen unter `/bekanntmachungen/index.php`. → `amtsblatt.json` wird nicht erstellt.
