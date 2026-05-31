# Schönwalde-Glien (Landkreis Havelland)

Amtsfreie Gemeinde im Landkreis Havelland, Brandenburg.

- **Website:** https://www.schoenwalde-glien.de
- **CMS:** ionas4 (`<meta name="generator" content="CMS ionas4"/>`)
- **Identifikation:** `class="article-teaser__wrapper"`, `news-index-item`, TVM-Kalender mit `events.json`, `:initial-download-items` für PDFs

## Datenquellen

| Kategorie | URL | Variante |
|-----------|-----|----------|
| News | `/de/rathaus-service/aktuelles/presse/` | ionas4 `<article class="… news-index-item …">` mit `<a class="article-teaser__wrapper">` + `<time datetime="ISO">` + `<span class="headline">` |
| Events | `/de/kalender/events.json?weekends=false&tagMode=ALL` | JSON-Endpoint des TVM-Kalenders (`id`, `start`, `end`, `title`, `location.name`) |
| Amtsblatt | `/de/rathaus-service/aktuelles/amtsblatt/` | Embedded JSON in `:initial-download-items="…"` des `downloadsFilterable`-Components |
| Bekanntmachungen | `/de/rathaus-service/aktuelles/bekanntmachungen/` | identisch zu News, gleiche Teaser-Struktur |

## Besonderheiten

- Veranstaltungen kommen via JSON-Endpoint statt HTML — vollständige Liste in einer Antwort.
- Amtsblatt-PDFs werden aus dem Vue-Component-Attribut `:initial-download-items` (HTML-escapter JSON-String) extrahiert. Felder: `downloadHref`, `fileName`, `fileCreatedTimestamp` (Unix-ms).
- Titel-Konvention: `Amtsblatt der Gemeinde Schönwalde-Glien Nr. NN JG YY` → wir speichern als `Amtsblatt Nr. NN/JG YY` mit ID `schoenwalde-glien-amtsblatt-jgYY-NN`.
- Bekanntmachungen haben das gleiche Teaser-Schema wie News.

## Datenqualität

| Kategorie | Anzahl beim Erstabruf |
|-----------|-----------------------|
| News | 41 |
| Events | 313 |
| Amtsblatt | 121 |
| Bekanntmachungen | 65 |
