# Birkenwerder

Gemeinde im Landkreis Oberhavel, Brandenburg.
Quelle: https://www.birkenwerder.de

## Quellen

| Typ    | URL                                                                                              |
|--------|--------------------------------------------------------------------------------------------------|
| News   | https://www.birkenwerder.de/rathaus/aktuelles/neuigkeiten                                        |
| Events | https://www.birkenwerder.de/rathaus/aktuelles/termine/veranstaltungen                            |

## Beispiele (Stand Einrichtung 2026-05-06)

**News:**
> 2026-05-06 – Stadtradeln: Im Mai gilt es wieder, klimaneutral Kilometer zu sammeln  
> https://www.birkenwerder.de/rathaus/aktuelles/neuigkeiten/details/stadtradeln-im-mai-gilt-es-wieder

**Events:**
> 2026-05-02 – Offene Atelier in Oberhavel am 02. und 3. Mai 2026  
> https://www.birkenwerder.de/rathaus/aktuelles/termine/veranstaltungen/details/...

## Datenqualität (Stand 2026-05-06)

- **News:** 30 Einträge; Datum aus `<time itemprop="datePublished" datetime="YYYY-MM-DD">`
- **Events:** 17 Einträge; Datum aus erstem `datetime=`-Attribut im article-Block

## Besonderheiten

- CMS: **TYPO3 news-list-view** mit `itemprop`-Markup
- News-Struktur: `<div class="article articletype-0">` → `<a class="article-link" href="/rathaus/aktuelles/neuigkeiten/details/[slug]">` → `<time itemprop="datePublished" datetime="YYYY-MM-DD">` + `<span itemprop="headline">Title</span>`
- Events-Struktur: identisch, aber `articletype-*` für Veranstaltungen, URL `/veranstaltungen/details/`
- News-ID: `birkenwerder-news-{slug}`
- Event-ID: `birkenwerder-event-{slug}`
- Datum aus `datetime`-Attribut der `<time>`-Elemente (ISO-Format `YYYY-MM-DD`)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft, `news: N Einträge` (N ≥ 10) ausgibt
2. `events: N Einträge` (N ≥ 5) ausgibt
3. Falls news = 0: Prüfen ob `<div class="article articletype-0">` noch im HTML von `/rathaus/aktuelles/neuigkeiten` vorkommt
4. Falls events = 0: Prüfen ob `/veranstaltungen/details/` noch in Links vorkommt
