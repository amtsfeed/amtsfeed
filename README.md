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
| Brandenburg  | Landkreis Havelland          | Amt Friesack, Amt Nennhausen, Amt Rhinow, Brieselang, Dallgow-Döberitz, Falkensee, Ketzin/Havel, Milower Land, Nauen, Premnitz, Rathenow, Schönwalde-Glien, Wustermark                                                                                                            |

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

# Alle Scraper sequenziell laufen lassen + Report (Differenzen pro Kategorie, Failures, Drops)
pnpm run-all-scrapers

# Nur Scraper unter einem Pfadfragment laufen lassen
pnpm run-all-scrapers "Landkreis Barnim"

# Nach einem Lauf updatedAt-Felder zurücksetzen, deren Item-Inhalt unverändert ist
pnpm run normalize-updated-at

# Änderungs-Log in UPDATES.md aktualisieren (neu/aktualisiert/entfernt pro Gemeinde+Kategorie)
pnpm append-update-log
```

**Empfohlene Reihenfolge nach einem Scraper-Lauf:**

```bash
pnpm run-all-scrapers
pnpm normalize-updated-at   # nur echte Inhaltsänderungen behalten
pnpm append-update-log      # neuen Block in UPDATES.md schreiben
```

### Vollständiger Tagesupdate-Workflow

Wer das Datenset auf den aktuellen Stand bringen will (z.B. ein Update-Agent), führt **diese vier Schritte in genau dieser Reihenfolge** aus — keine Zwischenschritte, keine zusätzlichen Entscheidungen:

```bash
# 1. Alle Scraper sequenziell laufen lassen (~10 Min für ~115 Scraper)
pnpm run-all-scrapers

# 2. updatedAt-Felder zurücksetzen, wo sich am Inhalt nichts geändert hat
pnpm normalize-updated-at

# 3. Änderungs-Log eintragen (schreibt nur, wenn echte Inhaltsdiffs existieren)
pnpm append-update-log

# 4. Alles in einem Commit festhalten — Datum im ISO-Format YYYY-MM-DD
git add -A
git commit -m "chore: update $(date +%Y-%m-%d)"
```

Schritt 4 hat keinen Tippfehler-Spielraum: die Commit-Message ist **immer** `chore: update YYYY-MM-DD` mit dem heutigen Datum (durch `$(date +%Y-%m-%d)` automatisch). Wenn `pnpm run-all-scrapers` Failures meldet (Exit-Code 1) oder eine Kategorie auf 0 abfällt, wird **nicht commitet** — stattdessen die betroffene Quelle im Scraper reparieren und erneut laufen lassen.

Wenn der Working Tree nach Schritt 2 leer ist (keine inhaltlichen Diffs), entfallen Schritte 3 und 4 — es gibt nichts zu commiten.

### `scripts/run-all-scrapers.ts`

Führt alle `wiki/**/index.ts` strikt **sequenziell** aus (kein Parallelismus — manche Quellen reagieren empfindlich auf gleichzeitige Requests) und erzeugt am Ende einen Report:

- **Total / OK / Failed** — Anzahl Scraper, davon erfolgreich
- **Zero-after-nonzero** — Kategorien (news/events/amtsblatt/notices), die vorher Einträge hatten und jetzt auf 0 stehen (starkes Regressions-Signal)
- **Drops > 50 %** — Kategorien mit vorher ≥ 5 Einträgen, jetzt weniger als die Hälfte
- **Vollständige Tabelle** — pro Scraper `vorher → nachher (±diff)` für jede der vier Kategorien

Exit-Code 0 bei sauberem Lauf, 1 bei Failures oder Zero-after-nonzero — geeignet für CI-Checks.

### `scripts/normalize-updated-at.ts`

Vergleicht jede in der Working Tree modifizierte JSON-Datei (`news/events/amtsblatt/notices/robots.json`) gegen `git HEAD`. Wenn sich der Item-Inhalt (alle Felder außer `fetchedAt` und `updatedAt`) nicht geändert hat, wird der alte `updatedAt`-Zeitstempel wiederhergestellt — sowohl auf Item-Ebene als auch top-level der Datei. Damit bleibt `updatedAt` ein sinnvolles Signal („zuletzt inhaltlich geändert"), statt bei jedem Scraper-Lauf zu kippen.

### `scripts/append-update-log.ts`

Vergleicht den aktuellen Working Tree gegen `git HEAD` und schreibt einen neuen Block oben in `UPDATES.md` mit den per-Gemeinde-und-Kategorie aufgeschlüsselten Zählern:

- **+N** — neue Items (ID war in HEAD nicht enthalten)
- **~N** — aktualisierte Items (ID in beiden, Inhalt ohne `fetchedAt`/`updatedAt` unterschiedlich)
- **-N** — entfernte Items (ID in HEAD, im Working Tree weg)

Vergleicht **nur Item-Inhalte** (nicht Timestamps), daher idealerweise nach `normalize-updated-at` aufrufen. Gibt es keine echten Änderungen, bleibt `UPDATES.md` unverändert. Die Zeile pro Gemeinde wird nur ausgegeben, wenn mindestens eine Kategorie nicht null ist; unveränderte Kategorien stehen als `—`.

Format eines Blocks:

```markdown
## 2026-05-31 19:12

Insgesamt **N neu**, **M aktualisiert**, **K entfernt** in X Quellen.

| Gemeinde | news | events | amtsblatt | notices |
|---|---|---|---|---|
| Ahrensfelde | +1 | +3 / ~2 | — | — |
| Landkreis Havelland (LK-Ebene) | +105 | — | +443 | — |
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
