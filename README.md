# amtsfeed

amtsfeed sammelt Veranstaltungen, Meldungen, Amtsblätter und Bekanntmachungen von öffentlichen Websites deutscher Ämter, Gemeinden und Städte und stellt sie als RSS-Feeds, iCalendar-Feeds und strukturierte JSON-Daten zur Verfügung.

**→ Weboberfläche: [amtsfeed.github.io](https://amtsfeed.github.io/)**

## Was amtsfeed ist

Viele Ämter, Gemeinden und Städte veröffentlichen Veranstaltungen, Pressemitteilungen, Amtsblätter und amtliche Bekanntmachungen auf eigenen Websites — aber ohne maschinenlesbare Formate wie RSS oder iCal. amtsfeed schließt diese Lücke: Es ist ein Feed-Aggregator auf Basis öffentlich zugänglicher Inhalte.

**amtsfeed ist nicht der Erzeuger der Inhalte.** Alle Veranstaltungen und Nachrichten stammen von den Websites der jeweiligen kommunalen Körperschaften. amtsfeed indexiert und strukturiert diese Inhalte lediglich technisch. Die Urheberrechte und Inhaltsrechte verbleiben bei den jeweiligen Körperschaften oder deren Quellen.

## Abgedeckte Regionen

| Bundesland   | Landkreis                    | Orte / Ämter                                                                                                                                                                                                                                                                       |
|--------------|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Brandenburg  | Landkreis Barnim             | Ahrensfelde, Amt Biesenthal-Barnim, Amt Britz-Chorin-Oderberg, Bernau bei Berlin, Eberswalde, Panketal, Schorfheide, Wandlitz, Werneuchen                                                                                                                                         |
| Brandenburg  | Landkreis Märkisch-Oderland  | Altlandsberg, Amt Barnim-Oderbruch, Amt Falkenberg-Höhe, Amt Golzow, Amt Lebus, Amt Märkische Schweiz, Bad Freienwalde (Oder), Fredersdorf-Vogelsdorf, Hoppegarten, Müncheberg, Neuenhagen bei Berlin, Oderbruch (Amt Seelow-Land, Seelow, Friedersdorf), Strausberg, Wriezen     |
| Brandenburg  | Landkreis Oberhavel          | Birkenwerder, Fürstenberg/Havel, Glienicke/Nordbahn, Gransee, Hennigsdorf, Hohen Neuendorf, Kremmen, Leegebruch, Löwenberger Land, Mühlenbecker Land, Oberkrämer, Oranienburg, Velten, Zehdenick                                                                                  |
| Brandenburg  | Landkreis Oder-Spree         | Amt Brieskow-Finkenheerd, Amt Neuzelle, Amt Scharmützelsee (Bad Saarow), Amt Schlaubetal, Amt Spreenhagen, Beeskow, Eisenhüttenstadt, Erkner, Friedland, Fürstenwalde/Spree, Grünheide (Mark), Rietz-Neuendorf, Schöneiche bei Berlin, Storkow (Mark), Tauche, Woltersdorf         |
| Brandenburg  | Landkreis Potsdam-Mittelmark | Amt Beetzsee, Amt Brück, Amt Niemegk, Amt Wusterwitz, Amt Ziesar, Bad Belzig, Beelitz, Groß Kreutz, Kleinmachnow, Kloster Lehnin, Michendorf, Nuthetal, Schwielowsee, Seddiner See, Stahnsdorf, Teltow, Treuenbrietzen, Werder (Havel), Wiesenburg/Mark                           |
| Brandenburg  | Landkreis Dahme-Spreewald    | Amt Schenkenländchen, Bestensee, Eichwalde, Heideblick, Heidesee, Lübben (Spreewald), Luckau, Märkische Heide, Mittenwalde, Schönefeld, Schulzendorf, Wildau, Zeuthen                                                                                                             |
| Brandenburg  | Landkreis Elbe-Elster        | Amt Kleine Elster (Niederlausitz), Amt Plessa, Amt Schlieben, Amt Schradenland, Bad Liebenwerda, Doberlug-Kirchhain, Elsterwerda, Finsterwalde, Herzberg (Elster), Röderland, Sonnewalde, Uebigau-Wahrenbrück, Verbandsgemeinde Bad Liebenwerda                                    |

## Datenstruktur

```text
wiki/
  bundesland/
    landkreis/
      gemeinde/
        index.ts       ← Scraper (liest Quelle, schreibt events.json / news.json / amtsblatt.json / notices.json)
        events.json    ← Strukturierte Veranstaltungsdaten
        news.json      ← Strukturierte Nachrichtendaten
        amtsblatt.json ← Strukturierte Amtsblatt-Einträge (wenn vorhanden)
        notices.json   ← Strukturierte Bekanntmachungen (wenn vorhanden)
        rss.xml        ← RSS-Feed (generiert aus news.json + amtsblatt.json + notices.json)
        events.ics     ← iCalendar-Feed (optional)
        robots.json    ← gecachte robots.txt der Quelle
        sources.json   ← offizielle Quell-URLs der Gemeinde (optional)
        README.md      ← Dokumentation der Quelle und Besonderheiten
```

Übergeordnete Verzeichnisse können ebenfalls ein `rss.xml` enthalten, das alle Inhalte der darunter liegenden Ebenen zusammenfasst.

### sources.json

Existiert bei einer Gemeinde bereits ein offizieller RSS- oder iCal-Feed, wird er in `sources.json` als Array eingetragen:

```json
[
  { "type": "rss", "url": "https://example.org/rss.xml", "title": "Meldungen Beispielstadt" },
  { "type": "ical", "url": "https://example.org/events.ics" }
]
```

- `type` — `"rss"` oder `"ical"`
- `url` — direkte Feed-URL
- `title` — optionaler Anzeigename; fehlt er, wird der Typ als Label verwendet

`pnpm generate-metadata` liest `sources.json` ein und überträgt die Einträge als `sources`-Array ins `wiki/metadata.json`.

## Feeds nutzen

Jede `rss.xml` ist ein vollständiger RSS 2.0-Feed (Meldungen, Amtsblätter, Bekanntmachungen) und kann direkt in einem Feed-Reader abonniert werden. Veranstaltungen sind ausschließlich im iCalendar-Feed (`events.ics`) enthalten.

```
wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow/rss.xml
wiki/Brandenburg/Landkreis Märkisch-Oderland/Amt Golzow/events.ics
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

Die indexierten Inhalte (Veranstaltungen, Meldungen, Amtsblätter, Bekanntmachungen) stammen von den öffentlichen Websites der jeweiligen Kommunen und werden dort von den jeweiligen Körperschaften (Ämter, Städte, Gemeinden) oder von diesen beauftragten Dienstleistern veröffentlicht. Die `README.md`-Dateien in den einzelnen Unterordnern dokumentieren jeweils die genaue Quelle.

amtsfeed:
- speichert keine Volltext-Inhalte, sondern nur Titel, Datum, URL und strukturierte Metadaten
- beachtet die `robots.txt`-Vorgaben der jeweiligen Websites
- verwendet einen eigenen User-Agent (`amtsfeed/...`) zur Identifikation
- ist kein kommerzielles Angebot

Bei Fragen zu den Quellinhalten wenden Sie sich bitte an die jeweilige Gemeinde oder Stadt. Bei Fragen zu amtsfeed öffnen Sie ein [Issue](https://github.com/amtsfeed/amtsfeed/issues).

## Beitragen

Neue Scrapers und Korrekturen sind willkommen. Jeder Scraper liegt als `index.ts` im entsprechenden Unterordner und folgt dem gleichen Muster: Robots.txt prüfen → HTML/API abrufen → `events.json` / `news.json` / `amtsblatt.json` / `notices.json` schreiben. Die Dokumentation des jeweiligen CMS und der Scraping-Muster liegt in [`CMS.md`](CMS.md).

## Verwandte Projekte

- **[OParl](https://oparl.org/)** — Standardisiertes API-Format für kommunale Ratsinformationssysteme (Sitzungen, Beschlüsse, Dokumente). Verfolgt ein ähnliches Ziel wie amtsfeed: kommunale Daten in maschinenlesbarer Form zugänglich machen — diesmal von Amts wegen.
- **[Politik bei uns](https://politik-bei-uns.de/)** — Bürgerportal, das OParl-Daten aufbereitet und zugänglich macht. Zeigt, wie strukturierte kommunale Daten für Bürgerinnen und Bürger nutzbar werden.

amtsfeed ergänzt diese Ansätze für den Bereich Veranstaltungen, Meldungen, Amtsblätter und Bekanntmachungen, wo noch kein standardisiertes Format existiert.

## Lizenz

Der Code (Scraper, Hilfsskripte) steht unter der [MIT-Lizenz](LICENSE).

Der Suchindex (events.json, news.json, amtsblatt.json, notices.json, rss.xml, events.ics) steht unter der [Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/deed.de).

Die indexierten Einzelinhalte unterliegen den Nutzungsbedingungen und dem Urheberrecht der jeweiligen veröffentlichenden Körperschaften.
