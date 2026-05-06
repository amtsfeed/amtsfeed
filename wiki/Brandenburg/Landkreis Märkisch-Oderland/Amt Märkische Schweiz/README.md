# Amt Märkische Schweiz

Verwaltungsamt im Landkreis Märkisch-Oderland, Brandenburg. Sitz: Buckow (Märkische Schweiz).
Quelle: https://www.amt-maerkische-schweiz.de

## Quellen

| Typ       | URL                                                                                          |
|-----------|----------------------------------------------------------------------------------------------|
| Events    | https://www.amt-maerkische-schweiz.de/tourismus/veranstaltungen/                            |
| News      | https://www.amt-maerkische-schweiz.de/portal/meldungen/uebersicht-0-34490.html?titel=Aktuelle+Meldungen |
| Amtsblatt | https://www.amt-maerkische-schweiz.de/verwaltung/amtsblatt/amtsblatt-{YEAR}/ (aktuell + Vorjahr) |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event (Punkt-Event mit Uhrzeit):**
> Di., 05.05.2026, 09:00 – 10:00 Uhr  
> Meditation im BaoBAB  
> https://www.amt-maerkische-schweiz.de/regional/veranstaltungen/meditation-im-baobab-900028298-34490.html?naviID=0

**Event (laufende Ausstellung):**
> läuft bis zum So., 06.09.2026  
> Ausstellung: Figuracja – Polnische Skulptur bei Seitz  
> https://www.amt-maerkische-schweiz.de/regional/veranstaltungen/ausstellung-figuracja-polnische-skulptur-bei-seitz-900028873-34490.html?naviID=0

**News:**
> 28.04.2026 – Infoabende in Buckow (Märkische Schweiz) für ein zukunftssicheres Zuhause  
> https://www.amt-maerkische-schweiz.de/portal/meldungen/infoabende-in-buckow-maerkische-schweiz-fuer-ein-zukunftssicheres-zuhause-900000716-34490.html?rubrik=900000001

**Amtsblatt:**
> Amtsblatt Mai 2026 — Erscheinungsdatum 30.04.2026  
> https://www.amt-maerkische-schweiz.de/downloads/datei/...

## Datenqualität (Stand 2026-05-06)

- **Events:** 377 Einträge. Event-Zeitraum: 2026-05-05 – 2026-09-30.
- **News:** 14 Einträge auf Seite 1 (96 gesamt im Archiv). Alle haben `publishedAt`.
- **Amtsblatt:** 16 Einträge (aktuell + Vorjahr). Titel: "Amtsblatt {Monat} {Jahr}"; `publishedAt` = Erscheinungsdatum.
- Laufende Ausstellungen haben kein explizites Startdatum im Listing — Enddatum wird als `startDate` verwendet.
- News-Pagination: 15 pro Seite — aktuell nur Seite 1 abgerufen.

## Besonderheiten

- CMS: **NOLIS Manager** (nicht PortUNA) — siehe [CMS.md](../../../../CMS.md)
- Events: ID aus `<a name="terminanker_ID">`, Datum aus `<span class="manager_untertitel">` (kann HTML-Entities + nested `span_enduhrzeit` enthalten)
- Events-Detailseite hat kein Datum im URL-Pfad (anders als PortUNA) → Datum nur aus Listing
- News: nur erste Seite (15 Einträge); Seite 2+ via `?p0=N` — Erweiterung auf mehrere Seiten möglich
- Amtsblatt: Jahresseiten `/verwaltung/amtsblatt/amtsblatt-{YEAR}/` — `<a class="link_dokument nolis-link-intern">` mit NOLIS `/downloads/datei/BASE64TOKEN` Links
- Amtsblatt-Titelformat: "Amtsblatt {Monatsname} {Jahr} (Erscheinungsdatum DD.MM.YYYY)" — Erscheinungsdatum ist Publikationsdatum, kann im Vorjahr liegen (z.B. Januar-Ausgabe erscheint im Dezember des Vorjahres)
- Amtsblatt-ID basiert auf Erscheinungsdatum-Jahr und -Monat, nicht auf dem Seiten-URL-Jahr
- robots.txt: Mehrere `User-agent:`-Blöcke ohne Leerzeilen → wurde durch Wechsel auf `robots-parser` library korrekt behandelt

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N > 100)
2. Event-ID `900028298` (Meditation im BaoBAB) in `events.json` vorhanden
3. News-ID `900000716` in `news.json` vorhanden
4. `amtsblatt: N Einträge` (N ≥ 5)
5. Falls N = 0: `terminanker_` Anker-Pattern prüfen oder ob CMS auf neue Version gewechselt hat
