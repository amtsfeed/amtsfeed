# Ahrensfelde

Amtsfreie Gemeinde im Landkreis Barnim, Brandenburg.
Quelle: https://www.ahrensfelde.de

## Quellen

| Typ    | URL                                                                                                          |
|--------|--------------------------------------------------------------------------------------------------------------|
| News   | https://www.ahrensfelde.de/aktuelles-mehr/aktuelle-meldungen/                                               |
| Events | https://www.ahrensfelde.de/veranstaltungen/veranstaltungen.ical?selected_kommune=30601&intern=0&zeitauswahl=1&auswahl_woche_tage=365 |

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
- Event-URL: `https://www.ahrensfelde.de/veranstaltungen/veranstaltungen/veranstaltung/{eventId}-30601.html`
- iCal-Zeilen müssen entfaltet werden (CRLF+Leerzeichen = Fortsetzung)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 5) und `events: N Einträge` (N ≥ 10) ausgibt
2. Falls news = 0: Prüfen ob die Seite noch `nolis-list-date` enthält
3. Falls events = 0: Prüfen ob iCal-Endpoint noch `BEGIN:VEVENT` enthält und ob Parameter noch gültig sind
