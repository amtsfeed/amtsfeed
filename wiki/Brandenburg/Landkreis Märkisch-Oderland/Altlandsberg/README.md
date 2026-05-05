# Altlandsberg

Amtsfreie Stadt im Landkreis Märkisch-Oderland, Brandenburg.
Quelle: https://www.altlandsberg.de

## Quellen

| Typ    | URL                                                                                              |
|--------|--------------------------------------------------------------------------------------------------|
| Events | https://www.altlandsberg.de/leben-wohnen/kultur-freizeit/veranstaltungen/ (via AJAX)            |
| News   | https://www.altlandsberg.de/buergerservice-verwaltung/weitere-themen/stadtnachrichten/          |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> 09.05.2026  
> Schlösser und Parks in Märkisch-Oderland  
> Ort: Schlossgut Altlandsberg  
> https://www.altlandsberg.de/leben-wohnen/kultur-freizeit/veranstaltungen/schloesser-und-parks-in-maerkisch-oderland-ein-blick-in-vergangenheit-und-gegenwart-19/

**News:**
> 04.05.2026 – Kranzniederlegung am 8. Mai  
> https://www.altlandsberg.de/buergerservice-verwaltung/weitere-themen/stadtnachrichten/kranzniederlegung-am-8-mai/

## Datenqualität (Stand 2026-05-05)

- **Events:** 32 Einträge (8 Seiten à 4 Events), alle mit Ortsangabe, kein Uhrzeit. Zeitraum: 2026-05-09 – 2026-12-19.
- **News:** 6 Einträge (1 Seite). Alle haben `publishedAt`.
- News-Datum im Format `DD.MM.YY` (zweistelliges Jahr) → wird korrekt auf 4-stelliges Jahr expandiert.

## Besonderheiten

- CMS: **TYPO3** mit eigenem Extension `altlandsbergevents_list`
- Events werden **per AJAX** nachgeladen (POST auf die Veranstaltungsseite mit `iconateAjaxDispatcherID=altlandsberg_events__list__geteventslist` und `actionData[currentPage]=N`)
- Events-ID: letztes numerisches Suffix im URL-Slug (z.B. `/schloesser-...-19/` → ID `19`)
- News: `<div class="news-item-content-container">`, Datum als `<span class="item-date">DD.MM.YY</span>` (zweistelliges Jahr), Titel in `<div class="item-headline"><a title="..." href="...">`, wobei `title` vor `href` kommt
- News enthält nur die aktuellsten 6 Einträge ohne Pagination

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `events: N Einträge` ausgibt (N > 10)
2. `news: N Einträge` ausgibt (N ≥ 3)
3. Falls events = 0: AJAX-Dispatcher-ID prüfen oder ob Events-Plugin durch etwas anderes ersetzt wurde
