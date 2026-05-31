# Amt Ruhland

- **Website:** https://www.amt-ruhland.de
- **CMS:** ionas4 (`<meta name="generator" content="CMS ionas4">`)
- **Landkreis:** Oberspreewald-Lausitz, Brandenburg
- **Mitgliedsgemeinden:** Ruhland, Guteborn, Hermsdorf, Hohenbocka, Schwarzbach, Lipsa, Grünewald

## Datenquellen

| Quelle      | URL                                                                   | Felder                                                       |
|-------------|-----------------------------------------------------------------------|--------------------------------------------------------------|
| News        | `/nachrichten-amt-ruhland/rss.xml` (RSS 2.0)                          | Titel, URL, `publishedAt` (`dc:date` / `pubDate`)            |
| Events      | `/kalender/events.json?weekends=false&tagMode=ALL` (JSON)             | Titel, Start/Ende, Ort, Tags (Ortsteil), optional Website-URL |
| Amtsblatt   | `/amtsverwaltung/amtsblatt/downloadItems.json?...` (JSON)             | Dateiname → Monat/Jahr, direkter PDF-Link (`downloadHref`)   |

## Besonderheiten

- Alle drei Endpoints liefern strukturierte Daten (RSS bzw. JSON) — kein HTML-Scraping nötig.
- Die `downloadItems.json`-URL braucht zwei verschlüsselte Parameter (`i4xpath` und `id`), die aus
  der gerenderten Amtsblatt-Seite extrahiert wurden (Snapshot vom 2026-05-31). Sollten sich diese
  ändern (Seite neu publiziert), muss die URL aktualisiert werden.
- Events kommen aus dem ionas4 "tvm" Termin-Picker. Das JSON-Feld `id` enthält Suffixe wie
  `:0` für Recurrence-Instanzen — Stable-ID = führender numerischer Teil.
- Eventzeiten sind im JSON ohne Zeitzone (lokale Berliner Zeit). Sie werden für die Feed-Ausgabe
  als-is in UTC notiert; der konsumierende Code zeigt sie als "Wanduhr-Zeit" an (gleiches Muster
  wie bei anderen ionas4-Scrapern im Repo).
- Detail-URL eines Events ist im JSON nicht vorhanden — falls `website` gesetzt ist, wird diese
  verwendet, sonst die Übersichtsseite `/veranstaltungen/`.
- Der RSS-Feed enthält die letzten ~30 News, deutlich mehr als auf der HTML-Seite üblich angezeigt.
- Keine strukturierte Liste öffentlicher Bekanntmachungen, daher kein `notices.json`.

## ID-Konvention

- `ruhland-news-{slug}`
- `ruhland-event-{tvm-id-numeric}`
- `ruhland-amtsblatt-{YYYY}-{MM}`
