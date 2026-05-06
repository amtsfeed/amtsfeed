# CMS-Übersicht

Bekannte CMS-Systeme und Erkennungsmerkmale im amtsfeed-Projekt.

## PortUNA

Weit verbreitetes Kommunal-CMS in Brandenburg/Berlin-Brandenburg-Raum.

**Erkennungsmerkmale:**
- URL-Pfade wie `/veranstaltungen/index.php`, `/news/1`
- HTML: `class="event-box"` oder `class="events-entry-3"`
- Betreiber-Hinweis oft im Quelltext

**Varianten:**

| Variante | Event-Container | Beispiel-Ort |
|----------|----------------|--------------|
| `event-box` | `<div class="event-box">` | Amt Golzow, Amt Falkenberg-Höhe |
| `events-entry-3` | `<div class="events-entry-3">` | Amt Lebus |
| `event-clndr-3` | `<span class="event-clndr-3-day has-entries" data-events="...">` | Wriezen |
| `event-entry-new-1` | `<div class="... event-entry-new-1">` | Hoppegarten |

**Besonderheiten:**
- News-Titel: `<h3>` (event-box) oder `<h4>` (events-entry-3) je nach Variante
- Datum oft mit Zero-Width-Spaces (`&#8203;`) zwischen Ziffern
- Doppelt kodierte Entities (`&amp;amp;`) möglich
- `event-clndr-3`: Events in `data-events`-Attribut, doppelt HTML-kodiert; Monatsnavigation via `?month=YYYY-MM`; News-URL-Muster: `/news/{category}/{id}/nachrichten/{slug}.html`; News-Container `<li class="news-entry-to-limit">`
- `event-entry-new-1`: Datum aus URL-Pfad (time-Elemente haben datetime="1970-01-01"-Bug); `time`-Elemente in `event-entry-new-1-daytime`-Block; Server kann bei vollem UA alle historischen News zurückgeben → NEWS_LIMIT empfohlen
- `tab_link_entry`: `<li class="tab_link_entry">` mit URL-Struktur `/veranstaltungen/{ID}/YYYY/MM/DD/slug.html`; Datum aus URL; Beispiel: Leegebruch

**PortUNA auf verwaltungsportal.de (gehostetes Gemeindeportal):**
- Manche Gemeinden nutzen `*.verwaltungsportal.de` statt eigener Domain
- Problem: Oft liefern alle Seiten nur „Es wurden keine Meldungen gefunden" ohne Inhalte
- Kein RSS-Feed, kein API-Endpoint vorhanden
- Beispiel: Liebenwalde (`liebenwalde.verwaltungsportal.de`) — kein Scraper möglich (Stand 2026-05-06)

---

## NOLIS

Kommunales CMS-System, weit verbreitet in Brandenburg. Zwei Varianten im Einsatz.

**Erkennungsmerkmale:**
- URL-Muster `nolis-list-item` im HTML
- Veranstaltungskalender unter `/veranstaltungen/`
- iCal-Endpoint `/veranstaltungen/veranstaltungen.ical` vorhanden
- `selected_kommune=NNNNN` Parameter identifiziert die Kommune

### Variante 1: RSS-Feed (News)

| Element | Selektor |
|---------|----------|
| Feed | `/portal/rss.xml` |
| Item | `<item>...</item>` |
| Titel | `<title>TEXT</title>` |
| URL | `<link>URL</link>` |
| Datum | `<pubDate>RFC-2822</pubDate>` → `new Date(pubDate).toISOString()` |
| ID | URL-Muster `(\d{6,})-KOMMUNE_ID`, prefixiert mit `{ortsname}-` |

Beispiel: Werneuchen (`werneuchen-barnim.de`, Kommune 30690)

### Variante 2: HTML-Liste (News)

| Element | Selektor |
|---------|----------|
| Container | `class="nolis-list-item "` (split) |
| Datum | `<p class="nolis-list-date">DD.MM.YYYY</p>` |
| Titel+URL | `<h4><a href="URL">TITEL</a></h4>` |
| ID | URL-Muster `(\d{6,})-KOMMUNE_ID`, prefixiert mit `{ortsname}-` |

Beispiel: Ahrensfelde (`ahrensfelde.de`, Kommune 30601)

### Events: iCal-Export

Alle NOLIS-Installationen bieten einen iCal-Endpoint für Veranstaltungen:

**URL-Muster:**
```
/veranstaltungen/veranstaltungen.ical?zeitauswahl=1&auswahl_woche_tage=365&kategorie=0&selected_kommune=NNNNN&beginn=YYYYMMDD000000&ende=YYYYMMDD235959&intern=0
```

Bei manchen Installationen reichen auch einfachere Parameter:
```
/veranstaltungen/veranstaltungen.ical?selected_kommune=NNNNN&intern=0&beginn=YYYYMMDD000000&ende=YYYYMMDD235959
```

**VEVENT-Felder:**

| Feld | Bedeutung |
|------|-----------|
| `SUMMARY` | Titel |
| `DTSTART` | Startdatum (YYYYMMDDTHHMMSSZ) |
| `DTEND` | Enddatum |
| `LOCATION` | Veranstaltungsort |
| `DESCRIPTION` | Beschreibung |
| `X-ID` | `KOMMUNE_ID_EVENTID` (z.B. `30601_900004756`) |

**Parsing-Besonderheiten:**
- iCal-Zeilen müssen entfaltet werden: CRLF+Leerzeichen = Zeilenfortsetzung
- `X-ID` letztes Segment = Event-ID → URL: `/{base}/veranstaltungen/veranstaltungen/veranstaltung/{eventId}-{kommuneId}.html`
- Backslash-Escaping: `\,` → `,`, `\n` → Zeilenumbruch

Beispiele: Ahrensfelde (104 Events, 365 Tage), Werneuchen (3 Events)

### Amtsblatt: Statische HTML-Seite mit Download-Links

NOLIS-Installationen stellen Amtsblätter oft auf einer statischen Seite mit `/downloads/datei/BASE64TOKEN`-Links bereit.

**Variante 1: Dateiname im Link (Werneuchen)**

| Element | Beschreibung |
|---------|-------------|
| Seite | Feste URL, z.B. `/portal/seiten/amtsblatt-stadt-werneuchen-900000022-30690.html` |
| Link | `<a href=".../downloads/datei/BASE64TOKEN">` |
| Datum | Aus Dateiname im `href`: `Amtsblatt{YY}-{MM}.pdf` → 2-stellige Jahreszahl |
| ID | `{ortsname}-amtsblatt-{YYYY}-{MM}` |

**Variante 2: Jahresseiten mit Erscheinungsdatum im Titeltext (Amt Märkische Schweiz)**

| Element | Beschreibung |
|---------|-------------|
| Seite | `/verwaltung/amtsblatt/amtsblatt-{YEAR}/` (aktuell + Vorjahr abrufen) |
| Link | `<a class="link_dokument nolis-link-intern" href=".../downloads/datei/TOKEN">` |
| Titeltext | `"Amtsblatt {Monatsname} {Jahr} (Erscheinungsdatum DD.MM.YYYY)"` |
| Datum | `publishedAt` = Erscheinungsdatum; kann im Vorjahr liegen (Jan-Ausgabe erscheint Dez) |
| ID | `{ortsname}-amtsblatt-{ErscheinungsJahr}-{ErscheinungsMonat}` (nicht Seiten-URL-Jahr!) |

---

## NOLIS Manager

**Erkennungsmerkmale:**
- URL-Muster `/nolis/` im HTML oder `nolis-manager` in Quelltext
- Oft als iframe eingebettet

*(Noch kein vollständiges Beispiel im Projekt)*

---

## TYPO3

Open-Source-CMS, häufig bei deutschen Kommunen.

**Erkennungsmerkmale:**
- `<!-- This website is powered by TYPO3 -->` im HTML-Quelltext
- CSS-Pfade `/typo3conf/ext/...` oder `/typo3temp/...`
- Meta: `<meta name="generator" content="TYPO3 CMS">`

**Varianten:**

### EXT:news (Standard-News-Extension)

| Element | Selektor |
|---------|----------|
| Container | `<div class="post-item article...">` |
| Datum | `<time itemprop="datePublished" datetime="YYYY-MM-DD">` |
| Titel | `<span itemprop="headline">TEXT</span>` |
| URL | `<a itemprop="url" href="URL">` |

Beispiel: Amt Barnim-Oderbruch (`barnim-oderbruch.de`)

### news-list-view mit articletype (Birkenwerder-Variante)

| Element | Selektor |
|---------|----------|
| Container | `<div class="article articletype-0 ...">` (News) / `articletype-*` (Events) |
| Link | `<a class="article-link" href="/rathaus/aktuelles/neuigkeiten/details/[slug]">` |
| Datum | `<time itemprop="datePublished" datetime="YYYY-MM-DD">` (leer, Datum nur im Attribut) |
| Titel | `<span itemprop="headline">TEXT</span>` |
| Event-URL | `/veranstaltungen/details/[slug]` |

Besonderheiten: `<time>`-Element ist inhaltsleer, Datum nur aus `datetime`-Attribut; ID = slug (max. 80 Zeichen).
Beispiel: Birkenwerder (`birkenwerder.de`)

### tx_news newsbox-Grid

| Element | Selektor |
|---------|----------|
| Container | `<div class="newsbox col-md-6 col-lg-4 my-4">` |
| Link | `<a title="Title" href="/buergerservice/aktuelles/details/[slug]">` |
| Datum | Nach `<i class="fa fa-calendar-o ...">` innerhalb 50 Zeichen: `DD.MM.YYYY` |
| Titel | `<h4 class="h5 mb-1 text-white">TEXT</h4>` |

Beispiel: Fürstenberg/Havel (`fuerstenberg-havel.de`)

### Bootstrap-Accordion (keine Einzel-URLs/Daten)

| Element | Selektor |
|---------|----------|
| Item | `<a href="#collapse-NNNN" class="accordion-toggle ...">TEXT</a>` |
| Datum | nicht vorhanden |
| URL | Alle Items teilen dieselbe Seiten-URL |

Besonderheiten: IDs aus `#collapse-NNNN`, kein Datum, keine Einzel-Artikel-URLs.
Beispiel: Zehdenick (`zehdenick.de/nachrichten.html`)

### Custom Events/News-Extension (event_title-Klasse)

| Element | Selektor |
|---------|----------|
| Container | split auf `<h2 class="second_font event_title">` |
| Link | `<a class="readmore second_font" href="/artikel-ansicht/show/[slug]/">Title</a>` |
| Datum | Nach `<i class="fa fa-fw fa-clock-o mr-1">` innerhalb 30 Zeichen: `DD.MM.YYYY` |

Besonderheiten: Datum nicht immer vorhanden; ID = slug (max. 80 Zeichen).
Beispiel: Oberkrämer (`oberkraemer.de`)

### EXT:newsslider (Homepage-Slider)

| Element | Selektor |
|---------|----------|
| Container | `<a class="card slick-link" href="URL">` |
| Datum | `<time itemprop="datePublished" datetime="YYYY-MM-DD">` |
| Titel | `<h5 class="card-title">TEXT</h5>` |

Beispiel: Stadt Müncheberg (`www.stadt-muencheberg.de`)

### Manuell gepflegte Veranstaltungsliste

Kein Events-Plugin, stattdessen plain-HTML in TYPO3-Textelement:
- Listen-Einträge: `<li class="text-justify"><strong>DD.MM.YYYY[...]</strong><br> Titel</li>`
- Keine eigenen Event-URLs
- Beispiel: Stadt Müncheberg Events-Seite

### EXT:events2

- JavaScript-Kalender-Extension (`events2/Resources/Public/JavaScript/Events2.js`)
- Oft mit komplexen URL-Parametern (`tx_events2_events%5Baction%5D=...`)
- *(noch kein fertiger Scraper im Projekt)*

### Altlandsberg-spezifische Extension (`altlandsbergevents_list`)

AJAX-geladene Events via POST:
```
iconateAjaxDispatcherID = altlandsberg_events__list__geteventslist
X-Requested-With: XMLHttpRequest
```
Beispiel: Altlandsberg (`www.altlandsberg.de`)

---

## IKISS CMS

Kommunales CMS, in Städten Brandenburgs und Berlin-Brandenburgs im Einsatz.

**Erkennungsmerkmale:**
- `data-ikiss-mfid` auf Listen-Elementen
- URL-Muster `FID=SITE.NNNN.1` in News-Links
- IKISS-Version-Hinweis im Quelltext

**Varianten:**

### Variante 1: liste-titel (Oranienburg)

| Element | Selektor |
|---------|----------|
| Datum | `<small class="date">DD.MM.YYYY</small>` |
| Container | Regex über `<small class="date">` + max. 400 Zeichen bis `<h4 class="liste-titel">` |
| Link | `<h4 class="liste-titel"><a href="...?FID=SITE.NNNN.1...">Title</a></h4>` |
| ID | `{ortsname}-news-{NNNN}` aus `FID=\d+.{NNNN}.\d+` |

Besonderheit: `www.oranienburg.de` → Redirect auf no-www; BASE_URL = `https://oranienburg.de`
Beispiel: Oranienburg (`oranienburg.de`)

### Variante 2: result-list mit data-ikiss-mfid (Velten, Hennigsdorf)

| Element | Selektor |
|---------|----------|
| Container | `<ul class="result-list">` → `<li data-ikiss-mfid="7.SITE.NNNN.1">` |
| Link | `<a href="URL" data-ikiss-mfid="7.SITE.NNNN.1">` |
| Datum | `<span class="sr-only">Datum: </span>DD.MM.YYYY` (in `<small>` oder `<span class="news-date">`) |
| Titel | `<h3 class="list-title">TEXT</h3>` |
| ID | `{ortsname}-news-{NNNN}` aus `data-ikiss-mfid="7.SITE.NNNN.1"` |

Beispiele:
- Velten: `data-ikiss-mfid="7.3631.NNNN.1"` — `www.velten.de` → Redirect auf no-www, BASE_URL = `https://velten.de`
- Hennigsdorf: `data-ikiss-mfid="7.3590.NNNN.1"`, Datum in `<span class="news-date">`

---

## WordPress + The Events Calendar (Tribe Events)

**Erkennungsmerkmale:**
- REST-Endpoint `/wp-json/tribe/events/v1/events` vorhanden
- JavaScript: `tribe-events`-CSS-Klassen oder `tribe_events`-Nonce

**REST API:**

```
GET /wp-json/tribe/events/v1/events?per_page=100&start_date=YYYY-MM-DD
→ { events: [...], total, total_pages, next_rest_url }
```

| Feld | Bedeutung |
|------|-----------|
| `id` | Numerische WordPress-Post-ID |
| `title` | Titel (kann HTML enthalten → Strip) |
| `url` | Direkte URL zur Veranstaltung |
| `start_date` | `YYYY-MM-DD HH:MM:SS` → `new Date(...).toISOString()` |
| `end_date` | wie `start_date` |
| `venue.venue` | Name des Ortes |
| `venue.city` | Stadt |
| `next_rest_url` | URL der nächsten Seite (Paginierung) |

Besonderheiten:
- Paginierung via `next_rest_url` (nicht via `page`-Parameter)
- Ort: `venue.venue + ", " + venue.city` (beide optional)
- ID: `{ortsname}-event-{id}`

Beispiel: Gransee (`gransee.de`, 470 Events)

---

## WordPress

**Erkennungsmerkmale:**
- `/wp-json/wp/v2/` API-Endpoint vorhanden
- CSS: `/wp-content/themes/...`
- Meta: `<meta name="generator" content="WordPress ..."/>`

**Varianten:**

### WordPress + TMB Events Plugin

| Element | Selektor |
|---------|----------|
| Container | split auf `class="tmb-event-wrapper "` |
| ID | `tmb-event-id-NNNN` → Composite `{tmb-id}-{YYYYMMDD}` |
| Datum | `<p id="tmb-event-date-range">DD.MM.YYYY[ bis DD.MM.YYYY] \| H:MM Uhr</p>` |
| Titel | `<h5>TITLE</h5>` |
| Ort | `<p class="tmb-event-location">ORT</p>` |

Besonderheiten:
- Epoch-0-Bug: Events mit Startjahr < 2000 filtern (erscheinen als 1970)
- Wiederkehrende Events: gleiche TMB-ID, verschiedene Tage → Composite-ID nötig

### WordPress REST API (News)

`/wp-json/wp/v2/posts?per_page=20&_fields=id,date,slug,link,title,excerpt`

Liefert strukturierte JSON-Daten mit `id`, `date` (ISO 8601), `link`, `title.rendered`, `excerpt.rendered`.

Beispiel: Bad Freienwalde (Oder) (`bad-freienwalde.de`)

### WordPress + Custom Post Types (`rb_events`, `rb_news`)

Events und News als Custom Post Types ohne REST-API-Exposition.

| Element | Quelle |
|---------|--------|
| Events | Monatsseiten `/veranstaltungen/YYYY-MM-01/{monat}-YYYY/` |
| Event-Container | `<article class="rb-event-item rb-event-item-id-{ID}-{YYYY-MM-DD} ...">` |
| Event-Datum | `<time datetime="YYYY-MM-DD">` |
| Event-Ort | `<address class="rb-event-item-location">` |
| News | `rb_news-sitemap.xml` (URLs + lastmod) + `/aktuelles/` HTML (Titel) |
| News-Titel | `<div class="rb-news-item rb-news-item-id{ID}"><h3>TITEL</h3>` |
| News-URL-Redirect | `GET /aktuelles/{slug}/` → 302 → `/aktuelles/#post-{ID}` |

Besonderheiten:
- `*/feed/` per robots.txt gesperrt → kein RSS-Feed nutzbar
- News-Strategie: Sitemap für Datum, HEAD-Request für Post-ID, HTML für Titel
- Monatsslugs: `januar`, `februar`, `marz` (ä→a), `april`, …, `dezember`
- Wiederkehrende Events: Composite-ID `{eventID}-{YYYYMMDD}` nötig

Beispiel: Strausberg (`www.stadt-strausberg.de`)

---

## Drupal (Carbonara-Theme)

**Erkennungsmerkmale:**
- `/themes/carbonara/` im HTML
- `/modules/contrib/loom_cookie/` oder ähnliche Drupal-Module
- `window.loomCookieSettingsECC` in JavaScript

**Besonderheiten:**
- Content oft JS-gerendert (kein statisches HTML per curl erreichbar)
- Kein strukturierter Events/News-Feed in statischem HTML

Beispiel: Bad Saarow (`bad-saarow.de`) — Events über externe Seite (scharmuetzelsee.de)

---

## Contao

Open-Source-CMS, gelegentlich bei deutschen Kommunen.

**Erkennungsmerkmale:**
- `<!-- This website is powered by Contao -->` oder ähnliches im HTML
- CSS-Pfade `/files/` oder `/assets/`
- URL-Muster `/{modul}-reader/{slug}`

**Varianten:**

### News (newslist-timeline)

| Element | Selektor |
|---------|----------|
| Container | `<div class="newslist-timeline block ...">` |
| Datum | `<div class="newslist-timeline-date">DD. Mon YYYY</div>` (deutsches 3-Buchstaben-Format) |
| Titel+URL | `<h4><a href="RELATIVER-PFAD">TITEL</a></h4>` |

Monatsabkürzungen: Jan, Feb, Mär, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez

### Events (mod_eventlist_v2)

| Element | Selektor |
|---------|----------|
| Container | `<div class="mod_eventlist_v2">` |
| Event-Link | `<a href="Veranstaltung/SLUG" title="TITLE (Wochentag, DD.MM.YYYY, HH:MM)">` |
| Vergangene Events | `class="bygone"` |

**Besonderheiten:**
- Datum steht im `title`-Attribut, nicht im `datetime`-Attribut
- `bygone`-Klasse markiert vergangene Events

Beispiel: Amt Biesenthal-Barnim (`amt-biesenthal-barnim.de`) — aktuell nur vergangene Events sichtbar

---

## Joomla

Open-Source-CMS, gelegentlich bei deutschen Kommunen.

**Erkennungsmerkmale:**
- `Joomla!` im HTML-Quelltext oder Meta-Generator
- URL-Muster `/index.php?option=com_...`

### com_dropfiles (Amtsblatt-Downloads)

Joomla-Extension für Datei-Downloads, genutzt für Amtsblatt-Archive.

**API-Endpunkte:**

```
# Unterkategorien (Jahres-Ordner) eines Root-Ordners
GET /index.php?option=com_dropfiles&view=frontcategories&format=json&id={ROOT_CAT}&top={ROOT_CAT}
→ { "categories": [{ "id": 123, "title": "2026" }, ...] }

# Dateien einer Kategorie
GET /index.php?option=com_dropfiles&view=frontfiles&format=json&id={CATID}
→ { "files": [{ "id": 665, "title": "Amtsblatt 2026-04", "created_time": "DD-MM-YYYY", "link": "https://..." }] }
```

**Besonderheiten:**
- `created_time` im Format `DD-MM-YYYY` (nicht ISO!)
- Jahres-Unterkategorien haben `title` = 4-stellige Jahreszahl → filtern mit `/^\d{4}$/`
- Nur letzte 2 Jahre abrufen (`.slice(0, 2)` nach absteigendem Sort)
- Datei-`link` ist direkter Download-URL (kein Redirect)
- Datei-Titel variiert: `Amtsblatt 2026-04` (Groß Kreutz) oder `Amtsblatt-2026-04` (Schreibweise mit Bindestrich)
- `publishedAt` aus Titelformat `YYYY-MM` extrahieren (nicht aus `created_time`)

Beispiele: Groß Kreutz (`gross-kreutz.de`, Root-Cat 386), Amt Ziesar (`amt-ziesar.de`, Root-Cat 59)

---

## Tourism Data Hub (DAMAS / scharmuetzelsee.de)

Regionale Tourismus-Datenplattform, genutzt als Event-Quelle von Gemeinde-Websites.

**Erkennungsmerkmale (TYPO3-Frontend):**
- `data-globalid="DAMASEvent_Event..."` auf Event-Containern
- `data-searchparameters='{...,"type":"Event",...}'`
- JavaScript: `teaser-slider js-teaser-slider`

**Event-Container (statisch im HTML gerendert):**

| Element | Selektor |
|---------|----------|
| Container | `<div class="teaser-card result-item" data-type="Event">` |
| URL | `<a class="teaser-card__link" href="https://www.scharmuetzelsee.de/event/SLUG">` |
| Titel | `<span class="teaser-card__header">TEXT</span>` |
| Datum | `<span class="teaser-card__subheader">DD.MM.YYYY[ - DD.MM.YYYY]</span>` |

Beispiel: Bad Saarow (via scharmuetzelsee.de)
