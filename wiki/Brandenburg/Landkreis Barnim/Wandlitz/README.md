# Wandlitz

Gemeinde Wandlitz (inkl. Ortsteil Zerpenschleuse), Landkreis Barnim, Brandenburg.
Quelle: https://www.wandlitz.de

## Quellen

| Typ    | URL                                                |
|--------|----------------------------------------------------|
| Events | https://www.wandlitz.de/veranstaltungen/index.php  |
| News   | https://www.wandlitz.de/news/1                     |

## Beispiele (Stand Einrichtung 2026-05-05)

**Event:**
> Di, 05. Mai 2026  
> „Atempause" für Sorgende, pflegende Angehörige & Interessierte  
> Kontaktladen "THEO"  
> https://www.wandlitz.de/veranstaltungen/2667597/2026/05/05/atempause-für-sorgende-pflegende-angehörige-interessierte.html

**News** (hat echtes Datum):
> Do, 30. April 2026  
> Einladung zum Gedenken an den 8. Mai in Klosterfelde  
> https://www.wandlitz.de/news/1182/1229501/kategorie/einladung-zum-gedenken-an-den-8.-mai-in-klosterfelde.html

## Besonderheiten

- Events: Alle 250+ Events auf einer Seite, keine Paginierung
- Events nutzen `<h2 class="legacy_h6">` statt `<h6>` — CMS-Variante
- News nutzt `news-entry-new-4` (nicht `-3` wie bei seelow.de) mit `news-entry-new-4-date`
- News hat echtes Datum in `<div class="news-entry-new-4-date">`

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler durchläuft und `events: N Einträge` ausgibt (N > 100)
2. Das Beispiel-Event (ID `2667597`) in `events.json` vorhanden ist
3. Die Beispiel-News (ID `1229501`) in `news.json` vorhanden ist
4. Falls Events 0: `legacy_h6`-Class könnte auf `legacy_h5` oder plain `h6` geändert worden sein
