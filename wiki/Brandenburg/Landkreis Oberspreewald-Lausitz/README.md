# Landkreis Oberspreewald-Lausitz

Scraper für die Webseite des Landkreises Oberspreewald-Lausitz (Brandenburg, Verwaltungssitz Senftenberg).

## Quelle

- **Domain:** `https://www.osl-online.de`
- **CMS:** PortUNA (verwaltungsportal.de) — Mandant 6971
- **Robots:** `robots.txt` blockiert nur einzelne Bots; `amtsfeed`-UA ist erlaubt.

## URL-Übersicht

| Datentyp | URL | Strategie |
|----------|-----|-----------|
| News | `/news/index.php?archiv=1&rubrik=1` | Vollständiges Archiv auf einer Seite (ca. 1,3 MB). Datums-Header + Item-Listen werden als Token-Stream geparst, das letzte gesehene Datum gilt für die folgenden Items. |
| Events | `/veranstaltungen/index.php` | PortUNA `event-box`-Liste; alle Termine (vergangen + zukünftig) auf einer Seite (~2,6 MB). URL-Pfad enthält Datum: `/veranstaltungen/{ID}/YYYY/MM/DD/{slug}.html`. |
| Amtsblatt | `/amtsblatt/index.php?ebene=496` | Jahresweise Akkordeons (1997–2026) mit Tabellen `Nr. N/YYYY \| DD.MM.YYYY \| Download`. PDFs werden via POST geliefert → URL = Listenseite mit `#gazette_{ID}`-Anker. |
| Bekanntmachungen | `/bekanntmachungen/index.php?ebene=496` | PortUNA-Tabellenvariante; direkte PDF-Links auf `daten.verwaltungsportal.de`. |

## Datenqualität

| Datentyp | Einträge | Zeitraum | Besonderheiten |
|----------|---------:|----------|----------------|
| News     | ~2.800  | 2011 – heute | Komplettes Archiv; pro Item sauberes `publishedAt`. Titel mit deutschen Umlauten und ggf. polnischen / sorbischen Sonderzeichen (z. B. `Żagań`, `Procuj se něnto`). |
| Events   | ~900    | Vergangen + Zukunft (~365 Tage Horizont) | Datum kommt aus dem URL-Pfad, Uhrzeit aus `<span class="event-time">`. Ort aus `<span class="event-ort">` (oft leer für kreisinterne Termine). |
| Amtsblatt | ~430   | 1997 – heute | Bis zu 29 Jahre Historie. Keine direkte PDF-URL — der Download erfolgt nur per HTML-POST-Formular. Wir verlinken daher auf die Listenseite mit Sprunganker. ID = `lk-osl-amtsblatt-{YYYY}-{NN}`. |
| Bekanntmachungen | ~50 | ab 2021 | Tabelle ohne Pagination. Titel aus `title="Download: …"`. Bei vorhandenem internem `/bekanntmachung/{ID}/`-Link wird dessen ID für `lk-osl-notice-{ID}` verwendet, sonst Datum + Titel-Hash. |

## ID-Konventionen

- News:           `lk-osl-news-{numericId}` (aus URL `/news/1/{ID}/nachrichten/…`)
- Events:         `lk-osl-event-{eventId}-{YYYYMMDD}` (Compound, da wiederkehrende Events identische `eventId` haben)
- Amtsblatt:      `lk-osl-amtsblatt-{YYYY}-{NN}` (führende Null)
- Bekanntmachungen: `lk-osl-notice-{noticeId}` (Fallback: `lk-osl-notice-{YYYY-MM-DD}-{titelSlug40}`)

## Besonderheiten

- **Zero-Width-Spaces (`&#8203;`)** in Datumsangaben (`27.&#8203;05.&#8203;2026`) müssen vor dem Regex-Match entfernt werden — dafür sorgt `decodeHtmlEntities`.
- **Amtsblatt-PDFs ohne direkte URL:** PortUNA setzt für jede Ausgabe ein POST-Formular mit Hash ein. Direktdownload-Versuche werden mit 403/Method-Not-Allowed quittiert. Wir liefern daher die Listenseite + Sprunganker (`#gazette_{ID}`); die Datei lässt sich von dort mit einem Klick öffnen.
- **Lange Historie:** Das Amtsblatt-Archiv reicht zurück bis 1997 (Erstausgabe nach Kreisgebietsreform). Alle Jahrgänge werden mitgescraped.
- **Polnische/sorbische Zeichen** in News-Titeln/URLs (`Chichy`, `Żagań`, `Procuj se něnto`, `Zły Komorow`) werden korrekt UTF-8-dekodiert.
- **Robots.txt:** Block-Liste betrifft Bingbot, ClaudeBot, GPTBot u. a. mit `Disallow: /`. Für den `amtsfeed`-UA gibt es **keinen** Eintrag — `assertAllowed` läuft sauber durch.

## Validierung

```bash
./node_modules/.bin/tsx "wiki/Brandenburg/Landkreis Oberspreewald-Lausitz/index.ts"
```

Erwartete Ausgabe:

```
news:      ~2800 Einträge → news.json
events:    ~900  Einträge → events.json
amtsblatt: ~430  Einträge → amtsblatt.json
notices:   ~50   Einträge → notices.json
```
