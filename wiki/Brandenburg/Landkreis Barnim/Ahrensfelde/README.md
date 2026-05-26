# Ahrensfelde

Amtsfreie Gemeinde im Landkreis Barnim, Brandenburg.
Quelle: https://www.ahrensfelde.de

## Quellen

| Typ    | URL                                                                                                          |
|--------|--------------------------------------------------------------------------------------------------------------|
| News   | https://www.ahrensfelde.de/aktuelles-mehr/aktuelle-meldungen/                                               |
| Events (Daten) | https://www.ahrensfelde.de/veranstaltungen/veranstaltungen.ical?selected_kommune=30601&intern=0&zeitauswahl=1&auswahl_woche_tage=365 |
| Events (Slug-URL-Map) | POST https://www.ahrensfelde.de/regional/veranstaltungen/sucheplus.html (paginated, `zeitauswahl=4` + `beginn_datum`/`ende_datum`, `p0=N`) |

## Beispiele (Stand Einrichtung 2026-05-05)

**News:**
> 30.04.2026 – Kommende Verkehrsbeeinträchtigungen in der Gemeinde Ahrensfelde  
> https://www.ahrensfelde.de/portal/meldungen/kommende-verkehrsbeeintraechtigungen-in-der-gemeinde-ahrensfelde-900000507-30601.html?rubrik=900000024

## Datenqualität (Stand 2026-05-06)

- **Events:** 104 Einträge via iCal-Export (365 Tage ab heute), alle mit Datum/Uhrzeit; ID aus `X-ID`-Feld (`30601_NNNNNNNN`)
- **News:** 15 Einträge, alle mit Datum (DD.MM.YYYY aus HTML-Liste)

## Besonderheiten

- CMS: **NOLIS** (`nolis-list-item`-Variante für News, iCal-Export für Events)
- News-Container: `<div class="nolis-list-item ...">`, aufgeteilt per `class="nolis-list-item "`
- News-Datum aus `<p class="nolis-list-date">DD.MM.YYYY</p>`
- News-ID aus URL-Muster `(\d{6,})-30601`, prefixiert mit `ahrensfelde-`
- Events: iCal-Endpoint `/veranstaltungen/veranstaltungen.ical` mit Pflichtparametern:
  `zeitauswahl=1&auswahl_woche_tage=365&kategorie=0&selected_kommune=30601&beginn=YYYYMMDD000000&ende=YYYYMMDD235959&intern=0`
- Event-ID aus VEVENT-Feld `X-ID: 30601_NNNNNNNN` (letztes Segment), prefixiert mit `ahrensfelde-event-`
- Event-URL: `https://www.ahrensfelde.de/regional/veranstaltungen/{slug}-{eventId}-30601.html` (kanonische NOLIS-Slug-URL)
- iCal-Zeilen müssen entfaltet werden (CRLF+Leerzeichen = Fortsetzung)

### Event-URL-Wechsel (Stand 2026-05-26)

Das frühere URL-Muster `/veranstaltungen/veranstaltungen/veranstaltung/{eventId}-30601.html` liefert seit einer NOLIS-Migration **404** für alle Events.

**Lösung:** Slug-URL-Map über die Veranstaltungssuche bauen. `fetchSearchUrlMap` postet an `/regional/veranstaltungen/sucheplus.html` mit `zeitauswahl=4&beginn_datum=YYYY-MM-DD&ende_datum=YYYY-MM-DD` (5 Jahre Zeitraum). Die erste Antwort enthält oben „Seite 1 von N" — über `p0=N` werden alle Seiten parallel (5er-Batches) geholt und die Slug-Links extrahiert.

- Eine Seite enthält ~15 Termine; ein voller Zeitraum-Lauf bringt ~600+ Slug-URLs auf einmal — deckt iCal-Bestand und alle Vergangenheits-Einträge in `events.json` ab.
- `mergeEvents` ersetzt für bestehende Einträge die alten 404-URLs durch die kanonische Slug-URL aus der Map.
- Slugs aus früheren `events.json`-Läufen werden als Backup in die Map übernommen — falls die Suche mal ausfällt, bleibt die Slug-URL bestehen.

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) und `events: N Einträge` (N ≥ 10) ausgibt
2. Falls news = 0: Prüfen ob die Seite noch `nolis-list-date` enthält
3. Falls events = 0: Prüfen ob iCal-Endpoint noch `BEGIN:VEVENT` enthält und ob Parameter noch gültig sind
