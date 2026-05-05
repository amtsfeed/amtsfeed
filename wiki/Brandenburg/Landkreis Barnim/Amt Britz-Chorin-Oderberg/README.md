# Amt Britz-Chorin-Oderberg

Amt im Landkreis Barnim, Brandenburg.
Quelle: https://britz-chorin-oderberg.de

## Quellen

| Typ    | URL                                              |
|--------|--------------------------------------------------|
| Events | https://britz-chorin-oderberg.de/events          |
| News   | https://britz-chorin-oderberg.de/thema/news      |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 06.05.2026 – Mehrgenerationensportfest in Oderberg  
> https://britz-chorin-oderberg.de/events#event-15493

**News:**
> 30.04.2026 – Sonderfahrpläne der BBG zum Waldstadtfestival in Eberswalde  
> https://britz-chorin-oderberg.de/news/sonderfahrplaene-barnimer-busgesellschaft-bbg-waldstadtfestival-eberswalde

## Datenqualität (Stand 2026-05-05)

- **Events:** 142 Einträge, alle mit ISO-Datum/Zeit aus `datetime`-Attribut, viele mit Ort.
- **News:** 15 Einträge auf `/thema/news`, alle mit ISO-Datum aus `datetime`-Attribut.

## Besonderheiten

- CMS: **WordPress** (custom theme „abco")
- Events: `<article class="event card" id="event-ID">` mit `<time class="event__date" datetime="ISO">`
- News: `<a class="teaser__link" href="URL"><h2 class="teaser__title">...` – Titel enthält `<span class="teaser__topic">` (Rubrik) und `<span class="screen-reader-only">`, die herausgefiltert werden
- RSS-Feed `/thema/news/feed` leitet per LiteSpeed-Cache auf die HTML-Seite um → direkte HTML-Verarbeitung
- News-URL-Muster: `https://britz-chorin-oderberg.de/news/{slug}`
- Event-URL-Muster: `https://britz-chorin-oderberg.de/events#event-{ID}`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N ≥ 10)
2. `news: N Einträge` ausgibt (N ≥ 3)
3. Falls events = 0: Prüfen ob die Seite noch `class="event card"` enthält
4. Falls news = 0: Prüfen ob die Seite noch `class="teaser__link"` enthält
