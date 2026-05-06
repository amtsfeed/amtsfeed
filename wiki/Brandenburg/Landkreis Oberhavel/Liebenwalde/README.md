# Liebenwalde

Stadt im Landkreis Oberhavel, Brandenburg.
Quelle: https://liebenwalde.verwaltungsportal.de

## Quellen

Keine Datenquellen verfügbar.

## Datenqualität (Stand 2026-05-06)

- **News:** keine — alle News- und Veranstaltungsseiten liefern „Es wurden keine Meldungen gefunden"
- **Events:** keine

## Besonderheiten

- CMS: **PortUNA / verwaltungsportal.de** (gehostetes Gemeindeportal)
- Die Seiten `/aktuelles/meldungen/`, `/veranstaltungen/` und weitere geben ausschließlich die Meldung „Es wurden keine Meldungen gefunden" zurück
- Kein RSS-Feed oder API-Endpoint vorhanden
- Stand 2026-05-06: kein Scraper implementiert

## Validierung

Periodisch prüfen ob die Gemeinde beginnt, Inhalte auf verwaltungsportal.de zu veröffentlichen:
- `curl -sL "https://liebenwalde.verwaltungsportal.de/aktuelles/meldungen/"` — enthält das HTML `Meldungen` ohne „keine Meldungen gefunden"?
