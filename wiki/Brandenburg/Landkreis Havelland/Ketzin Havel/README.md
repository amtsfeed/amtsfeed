# Stadt Ketzin/Havel

**CMS:** PortUNA / VerwaltungsPortal
**Website:** https://www.ketzin.de
(Hinweis: Die historische Domain `ketzin-havel.de` ist nicht mehr registriert, offizielle Domain ist `ketzin.de`.)

## Quellen

| Kategorie | URL | Format |
|-----------|-----|--------|
| News | `/news/rss.xml` | RSS 2.0 |
| Veranstaltungen | `/veranstaltungen/index.php` | HTML, Datum aus URL |
| Amtsblatt | `/amtsblatt/index.php` | HTML-Tabelle (PDF via POST) |
| Bekanntmachungen | `/bekanntmachungen/index.php` | HTML-Tabelle (3 Spalten: Datum, Titel, optional PDF) |

## Datenqualität

- **News:** RSS-Feed mit `pubDate` und News-ID im Query-Parameter `?news=NNN`.
- **Events:** Datum aus URL-Pfad. ID via `{eventId}-{YYYYMMDD}`.
- **Amtsblatt:** Klassische PortUNA-Tabelle `Nr. N/YYYY` + Datum + POST-Formular. URL ist Anker-Link auf Listenseite.
- **Bekanntmachungen:** Datum in `<td class="table-title">`, Titel in 2. `<td>` (`<p class="mandate">`-Bereich wird abgeschnitten), PDF aus 3. `<td>`. Viele PDFs liegen extern auf `daten.verwaltungsportal.de`.

## Besonderheiten

- Bei PortUNA-Bekanntmachungen steht der Titel als reiner Text in der 2. Spalte (kein eigener `<a>`-Tag); die 3. Spalte enthält den optionalen PDF-Link.
