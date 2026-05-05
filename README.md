# amtsfeed

amtsfeed sammelt Veranstaltungen und Nachrichten von öffentlichen Websites deutscher Ämter, Gemeinden und Städte und stellt sie als RSS-Feeds und strukturierte JSON-Daten zur Verfügung.

## Was amtsfeed ist

Viele Ämter, Gemeinden und Städte veröffentlichen Veranstaltungshinweise, Pressemitteilungen und Nachrichten auf eigenen Websites — aber ohne maschinenlesbare Formate wie RSS. amtsfeed schließt diese Lücke: Es ist eine Suchmaschine und ein Feed-Aggregator auf Basis öffentlich zugänglicher Inhalte.

**amtsfeed ist nicht der Erzeuger der Inhalte.** Alle Veranstaltungen und Nachrichten stammen von den Websites der jeweiligen kommunalen Körperschaften. amtsfeed indexiert und strukturiert diese Inhalte lediglich technisch. Die Urheberrechte und Inhaltsrechte verbleiben bei den jeweiligen Körperschaften oder deren Quellen.

## Abgedeckte Regionen

| Bundesland   | Landkreis                  | Orte / Ämter                                                                                               |
|--------------|----------------------------|------------------------------------------------------------------------------------------------------------|
| Brandenburg  | Landkreis Märkisch-Oderland | Altlandsberg, Amt Barnim-Oderbruch, Amt Falkenberg-Höhe, Amt Golzow, Amt Lebus, Amt Märkische Schweiz, Bad Freienwalde (Oder), Müncheberg, Oderbruch (Amt Seelow-Land, Seelow, Friedersdorf), Strausberg, Wriezen |
| Brandenburg  | Landkreis Oder-Spree       | Bad Saarow, Friedland                                                                                       |
| Brandenburg  | Landkreis Barnim            | Wandlitz                                                                                                    |

## Datenstruktur

```text
wiki/
  bundesland/
    landkreis/
      gemeinde/
        index.ts       ← Scraper (liest Quelle, schreibt events.json / news.json)
        events.json    ← Strukturierte Veranstaltungsdaten
        news.json      ← Strukturierte Nachrichtendaten
        rss.xml        ← RSS-Feed (generiert aus events.json + news.json)
        events.ics     ← iCalendar-Feed (optional)
        robots.json    ← gecachte robots.txt der Quelle
        README.md      ← Dokumentation der Quelle und Besonderheiten
```

Übergeordnete Verzeichnisse können ebenfalls ein `rss.xml` enthalten, das alle Inhalte der darunter liegenden Ebenen zusammenfasst.

## Feeds nutzen

Jede `rss.xml` ist ein vollständiger RSS 2.0-Feed und kann direkt in einem Feed-Reader abonniert werden.

```
wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow/rss.xml
wiki/Brandenburg/Landkreis Märkisch-Oderland/Wriezen/rss.xml
# usw.
```

## Lokale Nutzung

Voraussetzungen: [Node.js](https://nodejs.org/) ≥ 20, [pnpm](https://pnpm.io/)

```bash
pnpm install

# Scraper für einen Ort ausführen (aktualisiert events.json / news.json)
pnpm tsx "wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow/index.ts"

# RSS-Feed generieren
pnpm generate-rss "wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow"

# iCalendar generieren
pnpm generate-ical "wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow"

# Statistik anzeigen (Anzahl Events, News, letzte RSS-Einträge)
pnpm stats "wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow"
```

## Datenquellen und Urheberrecht

Die indexierten Inhalte (Veranstaltungen, Nachrichten) stammen von den öffentlichen Websites der jeweiligen Kommunen und werden dort von den jeweiligen Körperschaften (Ämter, Städte, Gemeinden) oder von diesen beauftragten Dienstleistern veröffentlicht. Die `README.md`-Dateien in den einzelnen Unterordnern dokumentieren jeweils die genaue Quelle.

amtsfeed:
- speichert keine Volltext-Inhalte, sondern nur Titel, Datum, URL und strukturierte Metadaten
- beachtet die `robots.txt`-Vorgaben der jeweiligen Websites
- verwendet einen eigenen User-Agent (`amtsfeed/...`) zur Identifikation
- ist kein kommerzielles Angebot

Bei Fragen zu den Quellinhalten wenden Sie sich bitte an die jeweilige Gemeinde oder Stadt. Bei Fragen zu amtsfeed öffnen Sie ein [Issue](https://github.com/amtsfeed/amtsfeed/issues).

## Beitragen

Neue Scrapers und Korrekturen sind willkommen. Jeder Scraper liegt als `index.ts` im entsprechenden Unterordner und folgt dem gleichen Muster: Robots.txt prüfen → HTML/API abrufen → `events.json` / `news.json` schreiben. Die Dokumentation des jeweiligen CMS und der Scraping-Muster liegt in [`CMS.md`](CMS.md).

## Verwandte Projekte

- **[OParl](https://oparl.org/)** — Standardisiertes API-Format für kommunale Ratsinformationssysteme (Sitzungen, Beschlüsse, Dokumente). Verfolgt ein ähnliches Ziel wie amtsfeed: kommunale Daten in maschinenlesbarer Form zugänglich machen — diesmal von Amts wegen.
- **[Politik bei uns](https://politik-bei-uns.de/)** — Bürgerportal, das OParl-Daten aufbereitet und zugänglich macht. Zeigt, wie strukturierte kommunale Daten für Bürgerinnen und Bürger nutzbar werden.

amtsfeed ergänzt diese Ansätze für den Bereich Veranstaltungen und Nachrichten, wo noch kein standardisiertes Format existiert.

## Lizenz

Der Code (Scraper, Hilfsskripte) steht unter der [MIT-Lizenz](LICENSE).

Der Suchindex (events.json, news.json, rss.xml) steht unter der [Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/deed.de).

Die indexierten Einzelinhalte (Veranstaltungstexte, Nachrichtentexte) unterliegen den Nutzungsbedingungen und dem Urheberrecht der jeweiligen veröffentlichenden Körperschaften.
