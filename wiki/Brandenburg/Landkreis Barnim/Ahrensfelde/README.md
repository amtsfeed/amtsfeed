# Ahrensfelde

Amtsfreie Gemeinde im Landkreis Barnim, Brandenburg.
Quelle: https://www.ahrensfelde.de

## Quellen

| Typ    | URL                                                              |
|--------|------------------------------------------------------------------|
| News   | https://www.ahrensfelde.de/aktuelles-mehr/aktuelle-meldungen/   |

Kein Events-Feed verfügbar.

## Beispiele (Stand Einrichtung 2026-05-05)

**News:**
> 30.04.2026 – Kommende Verkehrsbeeinträchtigungen in der Gemeinde Ahrensfelde  
> https://www.ahrensfelde.de/portal/meldungen/kommende-verkehrsbeeintraechtigungen-in-der-gemeinde-ahrensfelde-900000507-30601.html?rubrik=900000024

## Datenqualität (Stand 2026-05-05)

- **Events:** 0 Einträge (kein Events-Feed verfügbar)
- **News:** 15 Einträge, alle mit Datum (DD.MM.YYYY aus HTML-Liste)

## Besonderheiten

- CMS: **NOLIS** (`nolis-list-item`-Variante)
- News-Container: `<div class="nolis-list-item ...">`, aufgeteilt per `class="nolis-list-item "`
- Datum aus `<p class="nolis-list-date">DD.MM.YYYY</p>`
- ID aus URL-Muster `(\d{6,})-30601`, prefixiert mit `ahrensfelde-`
- Events-Kalender nicht vorhanden

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `news: N Einträge` ausgibt (N ≥ 5)
2. Falls news = 0: Prüfen ob die Seite noch `nolis-list-date` enthält
3. Falls IDs fehlen: Prüfen ob URL-Muster noch `(\d{6,})-30601` enthält
