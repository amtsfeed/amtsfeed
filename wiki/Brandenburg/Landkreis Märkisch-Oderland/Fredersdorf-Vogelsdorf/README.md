# Fredersdorf-Vogelsdorf

Amtsfreie Gemeinde im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.fredersdorf-vogelsdorf.de

## Quellen

| Typ    | URL                                                               |
|--------|-------------------------------------------------------------------|
| Events | https://www.fredersdorf-vogelsdorf.de/veranstaltungen/index.php  |
| News   | https://www.fredersdorf-vogelsdorf.de/news/1                     |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 05.05.2026 – Webinar-Woche der IHK Ostbrandenburg  
> https://www.fredersdorf-vogelsdorf.de/veranstaltungen/2896012/2026/05/05/webinar-woche-der-ihk-ostbrandenburg.html

**News:**
> 29.04.2026 – Sammelmobil für Alttextilien kommt  
> https://www.fredersdorf-vogelsdorf.de/news/1/1229000/nachrichten/sammelmobil-für-alttextilien-kommt.html

## Datenqualität (Stand 2026-05-05)

- **Events:** 77 Einträge, alle mit Datum, viele mit Zeit und Ort.
- **News:** 8 Einträge auf `/news/1`, alle mit Datum.

## Besonderheiten

- CMS: **PortUNA** (event-box-Variante, gleich wie Amt Golzow)
- News-Container: `<li class="news-entry-to-limit col-xs-12 col-sm-6">` (mit zusätzlichen CSS-Klassen)
- News-Titel: `<h4 class="title_news_19">` (nicht `<h3>` wie bei anderen PortUNA-Instanzen)
- News-Vorschau-Klasse: `vorschau_text` (nicht `vorschau`)
- News-URL: `/news/1/{ID}/nachrichten/{slug}.html`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 5)
2. `news: N Einträge` ausgibt (N ≥ 3)
3. Falls events = 0: Prüfen ob die Seite noch `class="event-box"` enthält
4. Falls news = 0: Prüfen ob die Seite noch `news-entry-to-limit` enthält
