# Oderbruch

Tourismusregion im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.oderbruch-tourismus.de

## Quellen

| Typ    | URL                                                        |
|--------|------------------------------------------------------------|
| Events | https://www.oderbruch-tourismus.de/veranstaltungen/index.php |
| News   | https://www.oderbruch-tourismus.de/news/1                  |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> Fr, 08. Mai 2026  
> Fahrervorstellung FIA Autocross  
> https://www.oderbruch-tourismus.de/veranstaltungen/2859505/2026/05/08/fahrervorstellung-fia-autocross.html

**News** (kein Datum auf der Listenseite — publishedAt = first-seen):
> Tourismustag der Oder Warthe Region am 24.10.2026  
> https://www.oderbruch-tourismus.de/news/1/1208425/nachrichten/tourismustag-der-oder-warthe-region-am-24.10.2026.html

## Besonderheiten

- Events: HTML-Struktur `event-entry-new-2`, Datum aus `<time datetime="YYYY-MM-DD">`, optionale Uhrzeit aus `event-entry-new-2-daytime`-Block (`<time>HH:MM</time>`)
- News: `news-entry-to-limit`-Items, Beschreibung aus `<p class="vorschau_text">`, **kein Datum** auf der Listenseite — `fetchedAt` dient als RSS-pubDate-Fallback
- Alle Events auf einer Seite, keine Paginierung

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler durchläuft und `events: N Einträge` ausgibt (N ≥ 5)
2. Das Beispiel-Event (ID `2859505`) in `events.json` vorhanden ist
3. Die Beispiel-News (ID `1208425`) in `news.json` vorhanden ist
4. Falls N = 0: HTML-Struktur hat sich geändert — `event-entry-new-2` Class prüfen
