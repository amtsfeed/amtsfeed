# Lübbenau/Spreewald

Amtsfreie Stadt im Landkreis Oberspreewald-Lausitz, Brandenburg. Sorbisch: Lubnjow/Błota.

- **Stadt-Website:** https://www.luebbenau-spreewald.de (PortUNA / VerwaltungsPortal CMS, Mandant `9548dce483809bc22c3ecbc5d1ecd1d542284`)
- **Tourismus-Website:** https://www.luebbenau-spreewald.com (separates System mit Mouse Calendar)
- **Bitte nicht verwechseln** mit **Lübben (Spreewald)** im Landkreis Dahme-Spreewald — andere Stadt, anderer Landkreis.

## Datenquellen

| Kategorie | URL | Variante |
|-----------|-----|----------|
| News (aktuelle Kacheln) | `/news/index.php?rubrik=1` | PortUNA `news-entry-to-limit`, Datum aus `<p class="vorschau_text">DD.MM.YYYY:` (mit Zero-Width-Spaces) |
| News (Archiv, monatlich) | `/news/index.php?archiv=1&rubrik=1&bis=YYYY-MM-01` | Monatsansicht mit `<h4 class="title_archive_19">DD.MM.YYYY</h4>` + `<ul><li><a>` — 12 Monate sequenziell (Server-Rate-Limit) geholt |
| Bekanntmachungen + Amtsblatt | `/bekanntmachungen` | Eine Seite mit drei Abschnitten |
| Events | `https://www.luebbenau-spreewald.com/natur-und-freizeit-/veranstaltungen-/veranstaltungskalender` | Mouse Calendar — `var jsevents = [...]` JSON-Array im HTML |

### News

- **Aktuell (Kacheln):** `<li class="news-entry-to-limit">` mit `<h3><a href="/news/1/{ID}/...">Titel</a></h3>` und `<p class="vorschau_text">DD.&#8203;MM.&#8203;YYYY: …</p>` (Zero-Width-Spaces zwischen Ziffern).
- **Archiv:** Die Listenseite zeigt nur ~6 aktuelle Kacheln. Echtes Archiv hängt am `bis=YYYY-MM-01`-Parameter mit `archiv=1`. Pro Monat ein Request; der Scraper holt 12 Monate sequenziell (Server-Rate-Limit).
- **News-ID:** zweites Pfadsegment aus `/news/1/{ID}/...` → `luebbenau-spreewald-news-{ID}`.
- **Datum-Parser:** zuerst Zero-Width-Spaces (`&#8203;`) entfernen, dann `DD.MM.YYYY` matchen.

### Bekanntmachungen und Amtsblatt

Beide Inhaltstypen liegen auf einer einzigen Seite (`/bekanntmachungen`) mit drei `<h2>`-Abschnitten:

1. *Übersicht der aktuellen Bekanntmachungen der Stadt Lübbenau/Spreewald* — Tabellenzeilen
2. *Bekanntmachungen Dritter* — Tabellenzeilen (gleiches Format)
3. *Überblick und Archiv der Amtsblätter der Stadt Lübbenau/Spreewald* — `<details>`-Accordion pro Jahr

**Bekanntmachungen-Pattern:**

```html
<h5><a href="PDF" title="…">TITEL</a></h5>
<p class="tiny_p">Veröffentlicht am DD.MM.YYYY/ Größe der PDF-Datei: NN KB</p>
```

Die Tabelle hat zwei Spalten pro Zeile (Download-Icon + Detail-Block); der Scraper greift das `<h5><a>…<p>Veröffentlicht am DD.MM.YYYY`-Muster der Detail-Spalte ab.

**Amtsblatt-Pattern:**

```html
<details><summary><p>YYYY</p></summary>
  <p><a href="PDF" title="…">Nummer NN (DD.MM.YYYY)</a></p>
  ...
</details>
```

Datum wird aus `(DD.MM.YYYY)` im Linktext geparst; Jahr aus dem Datum (nicht aus `<summary>`). Titel als `Amtsblatt Nr. {NN}/{YYYY}` synthetisiert.

**Partitionierung:** Alle Einträge mit Titel-Präfix `Amtsblatt` landen in `amtsblatt.json`, der Rest in `notices.json`. Da der Bekanntmachungen-Block keine Amtsblatt-Titel hat, ist die Aufteilung eindeutig.

**PDF-Hosting:** alle PDFs liegen auf `daten2.verwaltungsportal.de/dateien/seitengenerator/{MandantId}/...` — direkte Download-URLs, kein POST-Formular.

### Events (Tourismusportal `.com`)

Die Stadt verlinkt vom Verwaltungsportal auf die Tourismus-Website mit dem öffentlichen Veranstaltungskalender. Quelle ist nicht die `.de`-Domain, sondern `https://www.luebbenau-spreewald.com/natur-und-freizeit-/veranstaltungen-/veranstaltungskalender`. Das Portal nutzt die **Mouse Calendar**-Erweiterung (`/modules/mouse_calendar/js/events.js`).

Alle Events sind als JSON in einer JavaScript-Variablen im HTML eingebettet:

```html
<script>
var jsevents = [
  { "post_id": 117, "date_start": "31.05.2026", "date_end": "31.05.2026",
    "time_start": "10:30:00", "time_end": "17:30:00",
    "event_title": "...", "event_description": "...",
    "event_place": "...", "event_address": "..." },
  ...
];
</script>
```

Der Scraper extrahiert das Array per Regex (`var jsevents = (\[…\]);`), parsed es als JSON, und mappt jedes Element auf das `Event`-Schema. Datumsformat: `DD.MM.YYYY` (Strings) — wird in ISO konvertiert. Zeitsteuerung über `time_start`/`time_end` (24h, HH:MM:SS).

- **Event-ID:** `luebbenau-spreewald-event-{post_id}-{date_start ohne Punkte}`
- **Location:** `event_place` bevorzugt, sonst `event_address`
- **Description:** wird per `stripTags` von HTML befreit und auf 1000 Zeichen gekürzt
- **Endzeit:** nur wenn `date_end !== date_start` (oder Endzeit explizit gesetzt)

## Besonderheiten

- **Drei Subdomains:** Verwaltung (`.de`) hostet News/Bekanntmachungen, Tourismus (`.com`) hostet den Kalender — Scraper macht parallele Requests an beide Domains.
- **PortUNA-Variante** mit eigener Bekanntmachungstabelle (PortUNA-Standard wäre `<td valign="top">DD.MM.YYYY</td>` — Lübbenau nutzt stattdessen `<h5>` + `<p>` ohne Datumsspalte).
- **Archive-Crawling 12 Monate** klingt nach viel, aber jede Monatsseite ist klein (~25 KB), und die laufen parallel.
- **Lokale Sprache:** Sorbische Schreibweise „Lubnjow/Błota" erscheint nicht im Datenstrom, aber im README erwähnt — manche Veranstaltungstitel können sorbische Sonderzeichen enthalten.

## Datenqualität (Stand 2026-05-31)

| Kategorie | Anzahl |
|-----------|-------:|
| News | 116 (aktuelle 6 + ~110 aus 12 Monaten Archiv) |
| Events | 671 (vergangen + zukünftig, Tourismusportal) |
| Amtsblatt | 309 (Archiv bis 2003) |
| Bekanntmachungen | 22 (Aktuelle + Dritter) |
