# Stadt Rathenow

**CMS:** TYPO3 (EXT:news + Custom Events-Extension `rtn_events`)
**Website:** https://www.rathenow.de

## Quellen

| Kategorie | URL | Format |
|-----------|-----|--------|
| News (Pressemitteilungen) | `/verwaltung-politik/presse/pressemitteilungen/` (+ `/seite-N/`) | TYPO3 EXT:news (`articletype-0`) |
| Veranstaltungen | `/kultur-tourismus/veranstaltungskalender/alle-events-im-ueberblick/` | Custom `rtn_events` (`<div class="c-event">`) |
| Bekanntmachungen | `/online-bekanntmachungen/oeffentliche-bekanntmachungen/` | HTML-Tabelle (Datum, Titel, PDF) |

## Datenqualität

- **News:** Standard TYPO3 EXT:news mit `<time itemprop="datePublished" datetime="YYYY-MM-DD">`. Paginierung über `/seite-N/`. Default-Limit: 5 Seiten (~50 Einträge).
- **Events:** `<p class="c-event__dates">DD.MM.YYYY[ - DD.MM.YYYY]`, Ort in `<p class="c-event__location">`. Event-ID wird aus dem iCal-Download-Link extrahiert (`tx_rtnevents_list[event]=N`). Composite-ID `{eventId}-{YYYYMMDD}` für Wiederkehrer.
- **Bekanntmachungen:** Saubere Tabelle mit `<time datetime>`, Titel-Text und PDF-Link in fileadmin.

## Besonderheiten

- **Kein Amtsblatt** im klassischen Sinne — die Stadt Rathenow verwendet stattdessen das Bekanntmachungs-Portal. `amtsblatt.json` wird nicht erstellt.
- Die /aktuelles-Seite lädt News per AJAX nach (kein statisches HTML), daher wird der Pressemitteilungen-Bereich genutzt, der serverseitig gerendert ist.
