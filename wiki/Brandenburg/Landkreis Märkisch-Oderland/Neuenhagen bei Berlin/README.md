# Neuenhagen bei Berlin

Amtsfreie Gemeinde im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.neuenhagen-bei-berlin.de

## Quellen

| Typ    | URL                                                                                                |
|--------|----------------------------------------------------------------------------------------------------|
| Events | https://www.neuenhagen-bei-berlin.de/startseite-de/freizeit-tourismus/veranstaltungen/ (Discovery) |
| News   | https://www.neuenhagen-bei-berlin.de/sitemap.xml + Einzelseiten                                   |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 20. Juni – Tag der Familie  
> https://www.neuenhagen-bei-berlin.de/startseite-de/verkehr-verwaltung-aktuell/veranstaltungstermine-2026-1/

**News:**
> 2026-04-30 – Neues Anmeldeverfahren für Stände und Bühnenprogramm  
> https://www.neuenhagen-bei-berlin.de/startseite-de/aktuelles/2026/neues-anmeldeverfahren-fuer-staende-und-buehnen/

## Datenqualität (Stand 2026-05-05)

- **Events:** 25 Einträge aus manuell gepflegter Veranstaltungsliste für 2026.
- **News:** 20 Einträge (limitiert), Daten aus JSON-LD (schema.org) pro Artikel.

## Besonderheiten

- CMS: **ionas4** (custom Kommunal-CMS)
- Events: Manuell gepflegte Textliste auf der Veranstaltungstermine-Seite (kein strukturiertes Events-System)
- Events-URL wird dynamisch aus `/startseite-de/freizeit-tourismus/veranstaltungen/` entdeckt
- Events haben keine eindeutigen IDs → werden jedes Mal neu indiziert (`neuenhagen-event-YYYY-NNN`)
- Datumformate: `D. MMMM`, `DD.MM.`, `DD.MM. – DD.MM.`, `D. – D.MM`
- News: Sitemap gibt URLs + lastmod; Titel und Datum werden aus JSON-LD jeder Einzelseite gelesen (20 HTTP-Requests)
- Robots.txt liefert HTML (keine gültige robots.txt)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 10)
2. `news: N Einträge` ausgibt (N ≥ 5)
3. Falls events = 0: Prüfen ob `freizeit-tourismus/veranstaltungen/` noch den Link zur Veranstaltungstermine-Seite enthält
4. Falls news = 0: Prüfen ob `/startseite-de/aktuelles/`-Pfade noch in der Sitemap erscheinen
