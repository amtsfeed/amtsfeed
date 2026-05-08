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
- `event-box (clr/2)`: Listenansicht unter `/veranstaltungen/clr/2`; `<div class="event-box">`; URL-Muster `/veranstaltungen/{ID}/YYYY/MM/DD/slug.html`; ID = `{ortsname}-event-{eventId}-{YYYYMMDD}`; Zeit aus `<span class="event-time"><time>HH:MM</time> Uhr bis <time>HH:MM</time>`; Ort aus `<span class="event-ort">`; Beispiel: Löwenberger Land

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

### Variante 3: Bekanntmachungen (notices.json)

IKISS liefert Bekanntmachungen (amtliche Mitteilungen / öffentliche Dokumente) in einem separaten Bereich mit `mfid`-Präfix `6.`.

| Element | Selektor |
|---------|----------|
| Container | `<li data-ikiss-mfid="6.SITE.NNNN.1">` |
| Datum | `<span class="sr-only">Datum: </span>DD.MM.YYYY</small>` (Datum direkt nach `</span>`) → Match: `(\d{2})\.(\d{2})\.(\d{4})<\/small>` |
| Link+Titel | `<a href="/output/download.php?fid=SITE.NNNN.1..PDF" class="csslink_PDF">TITEL</a>` |
| ID | `{ortsname}-notice-{NNNN}` |
| Ausgabedatei | `notices.json` (Typ `NoticeItem`/`NoticesFile`) |

Besonderheit: Das Datum steht nicht als Text `Datum: DD.MM.YYYY`, sondern gesplittet: `<span class="sr-only">Datum: </span>` + nackter Text. Regex auf `</small>` als Anker.
Beispiel: Oranienburg (`oranienburg.de/Rathaus-Service/Aktuelles/Bekanntmachungen/`)

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

### WordPress + Modern Events Calendar (MEC) — RSS-Feed

MEC ist ein WordPress-Plugin für Veranstaltungskalender mit eigenem RSS-Namespace.

**Erkennungsmerkmale:**
- `/events/feed/` RSS-Endpoint
- RSS-Namespace: `xmlns:mec="..."`
- `<mec:startDate>`, `<mec:startHour>`, `<mec:location>` in Items

**RSS-Felder:**

| Feld | Bedeutung |
|------|-----------|
| `<guid>` | WordPress-Post-URL (enthält `[?&]p=(\d+)` als Post-ID — Achtung: HTML-kodiert als `&#038;p=`) |
| `<link>` | Direkte Event-URL (enthält oft `?occurrence=YYYY-MM-DD`) |
| `<mec:startDate>` | `YYYY-MM-DD` |
| `<mec:startHour>` | `HH:MM` |
| `<mec:location>` | Veranstaltungsort |

**Besonderheiten:**
- `<guid>` enthält `&#038;` statt `&` → Regex `[?&]p=(\d+)` schlägt fehl → Post-ID oft nicht extrahierbar
- Occurrence-Datum aus `<link>`: `?occurrence=YYYY-MM-DD` als Fallback-ID-Bestandteil
- ID: `{ortsname}-event-{postId||occurrence}-{YYYY-MM-DD}`
- Paginierung: `?paged=N` (bis leere Seite)

Beispiel: Amt Niemegk (`niemegk.de/events/feed/`)

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

---

## cmcitymedia (TYPO3-Kalender-Extension)

Kommerzielle TYPO3-Extension für Veranstaltungskalender, genutzt von brandenburgischen Gemeinden.

**Erkennungsmerkmale:**
- `exchange.cmcitymedia.de/{ortsname}/` in Quelltext (RSS- und iCal-Endpoints)
- Events in `<div class="list">` mit `<a id="event{ID}">`

**Events:**

| Element | Selektor |
|---------|----------|
| Container | split auf `<div class="list">` |
| ID | `<a id="event{ID}">` |
| Titel | `<div class="headline">TEXT</div>` |
| Datum | `<strong>...DD. Monat YYYY...</strong>` im Zeitblock |
| Zeit | `um HH:MM Uhr` im Zeitblock |
| Ort | `<div class="location">TEXT</div>` |
| URL | Kein HTML-Deeplink → iCal-URL: `https://exchange.cmcitymedia.de/{ortsname}/veranstaltungenIcal.php?id={ID}` |

**Paginierung:**
- Seite 1: `/{ortsname}/veranstaltungskalender`
- Seite N: `/index.php?id=20&publish%5Bp%5D=20&publish%5Bstart%5D={N}` (kein cHash erforderlich)
- Abbruch wenn Seite leer ist (kein `<div class="list">`)

Beispiel: Mühlenbecker Land (`muehlenbecker-land.de`, 80 Events)

---

## ScreendriverFOUR

Kommunales CMS, eingesetzt u.a. bei Gemeinden in Brandenburg.

**Erkennungsmerkmale:**
- Copyright/Fußzeile: `ScreendriverFOUR` oder `© screendrive`
- URL-Muster `/aktuelles/mitteilungen/slug.html` (News)
- Amtsblatt-Pfad: `/images/downloads/Amtsblatt/YYYY/FILENAME.pdf`
- Events via Tourismusverband-Seite mit `?se=ID`

**News:**

| Element | Selektor |
|---------|----------|
| Datumblock | `<strong>DD.MM.YYYY</strong>` |
| Link | `href="/aktuelles/[rubrik]/slug.html"` |
| Titel | `<h2><a href="...">TITEL</a></h2>` |
| ID | `{ortsname}-news-{slug}` |

**Amtsblatt:**

| Element | Selektor |
|---------|----------|
| Regex | `<strong>Amtsblatt YYYY/N</strong>` + bis 400 Zeichen + `href="/images/downloads/Amtsblatt/YYYY/...pdf"` |
| Datum | `vom DD.MM.YYYY` im Textblock zwischen Titel und Link |
| ID | `{ortsname}-amtsblatt-{YYYY}-{NN}` |

**Events (via Tourismusverband-CMS):**

| Element | Selektor |
|---------|----------|
| Container | `<div class="col-sm-4 eventbox ` (split — trailing space) |
| ID | `?se={ID}` aus `veranstaltungsinformationen.html?se=NNNNNNNN` |
| Datum + Zeit | `<strong>DD.MM.YYYY</strong> \| HH:MM Uhr` |
| Titel | `<h3><a href="...">TITEL</a></h3>` |
| Ort | `<div class="event_ort">Ort: TEXT</div>` |
| URL | `{TOURISMUS_BASE}/veranstaltungen/veranstaltungsinformationen.html?se={ID}` |

Besonderheit: Die Events liegen auf der Tourismus-Website (`schwielowsee-tourismus.de`), nicht auf der Gemeindewebsite. `robots.txt` wird für die Gemeindewebsite gecheckt; für die Tourismus-Seite separat.
Beispiel: Schwielowsee (`schwielowsee-tourismus.de`, 1026 Events)

---

## RIS (Ratsinformationssystem)

Kommunales Rats-Informationssystem für Sitzungen, Beschlüsse und Dokumente. Einige RIS-Instanzen veröffentlichen auch Amtsblätter.

**Treuenbrietzen (ti-1):**

| Element | Selektor |
|---------|----------|
| Seite | `https://ris.treuenbrietzen.de/ti-1/listen/ti_226_f31.php` |
| Jahres-Blöcke | split auf `data-role="collapsible"` |
| Titelzeile | `Amtsblatt Nr. N im Jahr YYYY vom DD.MM.YYYY` |
| PDF-Link | `href="listen/Anlage_asj...pdf"` → `{RIS_BASE}{href}` |
| Fallback-URL | Listenseite selbst wenn kein PDF |
| ID | `{ortsname}-amtsblatt-{YYYY}-{NN}` |

Beispiel: Treuenbrietzen (`ris.treuenbrietzen.de`)

---

## NOLIS Amtsblatt — Variante 3: dokumenteplus-Archiv (Ahrensfelde)

Ergänzung zu den bestehenden NOLIS-Varianten: Amtsblatt-Archiv via NOLIS-Managerbox mit jahresweiser Unterseiten-Struktur.

**Erkennungsmerkmale:**
- URL-Muster `/aktuelles-mehr/amtsblatt/amtsblatt-archiv/` auf der Archivseite
- Jahreslinks: `<a href="/amtsblatt-archiv/{YYYY}/">YYYY</a>` oder ähnlich
- Download-Links: `href="...ahrensfelde.de/downloads/datei/..."` (Direktdownload)

**Parsing:**

| Element | Selektor |
|---------|----------|
| Archivseite | `/aktuelles-mehr/amtsblatt/amtsblatt-archiv/` |
| Jahres-URL | `<a href="[^"]+amtsblatt-archiv/(\d{4})[^"]*">` |
| Abruf | letzte 3 Jahre parallel |
| Dateiblöcke | split auf `managerbox ` |
| Download-Link | `href="([^"]*ahrensfelde\.de/downloads/datei/[^"]*)"` (erstes Vorkommen) |
| Titel | `<td class="dokumente_inhalt">TEXT</td>` |
| Datum | Monatsname im Titel (`Amtsblatt Monat YYYY`) → GERMAN_MONTHS-Lookup → `YYYY-MM-01` |
| ID | `{ortsname}-amtsblatt-{YYYY}-{MM}` |

Besonderheit: Die Jahresseiten-URLs werden von der Archivseite extrahiert; keine hartkodierte URL-Liste.
Beispiel: Ahrensfelde (`ahrensfelde.de`, 28 Einträge)

---

## PortUNA — neue Varianten

### news-entry-new-3 (News mit deutschen Monatsnamen)

Neuere PortUNA-Installationen zeigen das Datum als ausgeschriebenen Monatsnamen statt DD.MM.YYYY.

**Erkennungsmerkmale:**
- `class="news-entry-new-3-date"` statt `news-entry-new-2-date`
- Datumsformat: `DD. Monat YYYY` (z.B. `07. Mai 2026`), oft mit Wochentag-Prefix `Mo, `

**Parsing:**

| Element | Selektor |
|---------|----------|
| Container | `<li class="news-entry-to-limit">` |
| Titel+URL | `<h3><a href="/news/...">Titel</a></h3>` |
| Datum-Block | `class="news-entry-new-3-date"` |
| Datumstext | Text nach Strip der `<span>Wochentag</span>`: `(\d{1,2})\.\s*(\S+)\s+(\d{4})` |
| Monats-Mapping | MONTHS-Objekt: `{ Januar: "01", ..., Dezember: "12" }` |

Beispiel: Amt Plessa (`plessa.de`)

### event-entry-new-2 smol (Events via URL-Datum)

PortUNA-Variante für kleinere Gemeinden: Events ohne eigenen Inhaltsblock, Datum ausschließlich aus URL.

**Erkennungsmerkmale:**
- `class="event-entry-new-2 smol"` im HTML
- URL-Muster: `/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/{slug}.html`

**Parsing:**

| Element | Selektor |
|---------|----------|
| URL | `<a href="/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/{slug}.html">` |
| Datum | aus URL-Pfad-Segmenten (kein `time`-Element) |
| Titel | Anchor-Text |
| Filter | Titel `"mehr"` und Leerstring überspringen |
| ID | `{ortsname}-event-{eventId}-{YYYYMMDD}` |

Beispiele: Amt Plessa (`plessa.de`), Amt Schenkenländchen (`amt-schenkenlaendchen.de`)

### gazette-tab Amtsblatt (PortUNA)

Neueres PortUNA-Format für Amtsblätter mit `<article class="gazette-tab">` statt Tabellen.

**Parsing:**

| Element | Selektor |
|---------|----------|
| Container | `<article class="gazette[^>]*>` |
| Titel | `<h3>Ausgabe Nr. X/YYYY</h3>` |
| Datum | `<time datetime="YYYY-MM-DD">` |
| Filter | Titel muss mit `"Ausgabe"` beginnen |
| URL | Listenseiten-URL (kein Direktdownload bei POST-basierten PDFs) |

Hinweis: Einige PortUNA-Installationen liefern Amtsblatt-PDFs via POST-Formular mit Hash-Parameter. In diesem Fall wird die Listenseiten-URL mit `#gazette_{ID}`-Anker verwendet.
Beispiel: Amt Plessa (`plessa.de`, 277 Einträge)

### PortUNA Bekanntmachungen — Tabellenvariante

Neuere PortUNA-Installationen listen Bekanntmachungen in einer HTML-Tabelle.

| Element | Selektor |
|---------|----------|
| Datum | `<td class="table-title">DD.MM.YYYY</td>` oder `<td valign="top">DD.MM.YYYY</td>` |
| Titel | `<td class="table-content">Titel</td>` oder nächste `<td>` nach Datum |
| PDF | `<a href="/...">` in letzter `<td>` |

Beispiel: Amt Plessa, Verbandsgemeinde Bad Liebenwerda

---

## ionas4

Modernes kommunales CMS aus Sachsen/Brandenburg. Serverseitig gerendertes HTML, keine AJAX-Pagination.

**Erkennungsmerkmale:**
- `class="news-index-item"` für News-Teaserblöcke
- `<time datetime="ISO-Datum">` für maschinenlesbare Datumsangaben
- Amtsblatt-PDFs im Pfad `amtsblaetter/YYYY/YYYY-MM-*.pdf`

**News-Parsing:**

| Element | Selektor |
|---------|----------|
| Container | `class="[^"]*news-index-item[^"]*"` |
| URL | `<a href="https://{BASE}/...">` im Container |
| Datum | `<time datetime="ISO-Datum">` — direkt als ISO-Datum übernehmen |
| Titel | `<span class="headline[^"]*">Text</span>` |
| ID | letztes URL-Pfad-Segment ohne trailing slash |

**Amtsblatt-Parsing:**

| Element | Selektor |
|---------|----------|
| PDF-Links | `href="amtsblaetter/YYYY/YYYY-MM-amtsblatt*.pdf"` (relativ oder absolut) |
| Monat | aus Pfad-Segmenten `YYYY-MM` |
| Titel | `Amtsblatt Nr. {MM}/{YYYY}` (Monat als Zahl ohne führende Null) |
| publishedAt | `YYYY-MM-01T00:00:00.000Z` |
| Basis-URL | `{BASE_URL}/stadt-{name}/de/` für relative Pfade |

Hinweis: Die Seite `luebben.de` hat Meta-Tags `noai, noindex` — diese betreffen nur KI-Indexierungsroboter, nicht generische Crawler. Die `robots.txt` selbst sperrt amtsfeed nicht aus.
Beispiele: Lübben (Spreewald) (`luebben.de`), Beeskow (`beeskow.de`)

---

## Sitepark

CMS-System häufig eingesetzt bei Städten in Brandenburg. Serverseitig gerendert, keine AJAX-Pagination.

**Erkennungsmerkmale:**
- `<article id="article_SLUG" class="listItem">` für News-Einträge
- `class="dateText">DD.MM.YYYY` für das Datum
- Amtsblatt in jahresweisen Unterseiten mit langen URLs

**News-Parsing:**

| Element | Selektor |
|---------|----------|
| Container | `<article id="article_SLUG" class="listItem[^"]*">` |
| Slug | `id`-Attributwert (→ ID) |
| URL | `href="/de/buergerportal/aktuelles/aktuelle-meldungen/[^"]+"` |
| Titel | `title="..."` im `<a>`-Tag |
| Datum | `class="dateText">DD.MM.YYYY` |

**Amtsblatt-Parsing:**

- Jahresweise Unterseiten mit hartkodierten URLs (z.B. `...artikel-ausgaben-...2026.html`, `...2025.html`)
- HTML-Tabelle: col0 = Lokalanzeiger-PDF + Datum, col1 = Amtsblatt-PDF + Datum
- Datum aus Amtsblatt-Spalte, Fallback auf Lokalanzeiger-Spalte
- PDF-Link: erstes `href="[^"]+\.pdf"` in der Amtsblatt-Zelle

**Bekanntmachungen-Parsing (Accordion-Tabelle):**

| Element | Selektor |
|---------|----------|
| Zeilen | `<tr>`, Header überspringen (`background-color.*dcdcdc` oder `Veröffentlicht`) |
| Datum | col0 (ggf. über mehrere Zeilen gültig, `lastDate` merken) |
| Titel | col2 |
| PDF | col4: `href="[^"]+\.pdf"` |

Beispiele: Luckau (`luckau.de`)

---

## maXvis v4

CMS-System für kleinere Kommunen. News werden per AJAX geladen (nicht in HTML), aber über Sitemap auffindbar.

**Erkennungsmerkmale:**
- Sitemap unter `/sitemap.xml` mit Artikeln im URL-Format `Titel-NNNNNN.html` (6-stellige ID)
- Artikelseiten haben `class="artdate">DD.MM.YYYY` für das Datum
- Amtsblatt-PDFs mit Namensmuster `Amtsblatt-YYYY-MM-NNNNNN.pdf`
- News-Liste unter `/meldungen` liefert AJAX — kein direktes HTML-Scraping möglich

**Strategie: Sitemap → Artikel-Einzelseiten:**

| Schritt | Beschreibung |
|---------|-------------|
| 1 | Sitemap abrufen, Artikel-URLs mit IDs >= Schwellenwert (z.B. 700000) extrahieren |
| 2 | Nur neue Artikel abrufen (IDs nicht in vorhandenen Daten) |
| 3 | `<h2>` als Titel, `class="artdate">` als Datum auslesen |
| 4 | Bekannte statische Seiten-IDs ausschließen |

**Amtsblatt-Parsing:**

| Element | Selektor |
|---------|----------|
| Seite | `/amtsblatt` |
| PDF-Link | `href="[^"]*Amtsblatt-(\d{4})-(\d{2})-(\d+)\.pdf"` |
| Titel | `Amtsblatt YYYY Nr. NN` |
| Datum | `YYYY-MM-01T00:00:00.000Z` |

Beispiel: Zeuthen (`zeuthen.de`)

---

## JGS Media / ASP.NET

Proprietäres ASP.NET-CMS für kleinere Kommunen.

**Erkennungsmerkmale:**
- `class='listItem' onclick="location.href='/Gemeindeneuigkeiten/...'"` für News-Einträge
- Datum in Klammern `(DD.MM.YYYY)` in einem `<p>`-Tag nach dem Titel
- Amtsblatt ausschließlich als ePaper über externe Plattform (wittich.de) — kein Scraping möglich

**News-Parsing:**

| Element | Selektor |
|---------|----------|
| Container | `class='listItem' onclick="location.href='/Gemeindeneuigkeiten/...'"` |
| URL | aus `onclick`-Attribut: `/Gemeindeneuigkeiten/slug.html` |
| Titel | `<h3>Text</h3>` |
| Datum | `<p>(DD.MM.YYYY)</p>` nach dem Titel |
| ID | `{ortsname}-news-{url-slug}` |

Beispiel: Märkische Heide (`maerkische-heide.de`)

---

## REDAXO

Open-Source PHP-CMS. Erkennbar am URL-Aufbau und an spezifischen CSS-Klassen.

**Erkennungsmerkmale:**
- URL-Pfade wie `/verwaltung/aktuelles/SLUG` und `/verwaltung/amtsblatt`
- `<h3 class="nomargin"><a href="/verwaltung/aktuelles/SLUG">Titel</a></h3>`
- `<span class="news-date">DD.MM.YYYY</span>` direkt nach dem Titel-Block
- Amtsblatt als HTML-Tabelle: `<a href="/media/FILE.pdf">Nr. NUM/YEAR</a>` + Datum-Spalte

**News-Parsing:**

| Element | Selektor |
|---------|----------|
| Muster | `<h3 class="nomargin"><a href="(/verwaltung/aktuelles/([^"]+))">(Titel)</a>[\s\S]*?<span class="news-date">(DD.MM.YYYY)</span>` |
| ID | URL-Slug direkt |
| Datum | `DD.MM.YYYY` → `YYYY-MM-DDT00:00:00.000Z` |

**Amtsblatt-Parsing:**

| Element | Selektor |
|---------|----------|
| Zeile | `<tr><td><a href="/media/FILE.pdf">Nr. N/YYYY</a></td><td>DD.MM.YYYY</td></tr>` |
| Nummer | aus Anchor-Text extrahiert |
| Datum | zweite `<td>` |
| ID | `{ortsname}-amtsblatt-{YYYY}-{NN}` |

Beispiel: Amt Kleine Elster (Niederlausitz) (`amt-kleine-elster.de`, 209 Amtsblätter)

---

## Custom PHP CMS (Dreamweaver-Stil)

Einfaches statisches oder semi-statisches PHP/HTML-CMS ohne Framework, häufig mit Adobe Dreamweaver erstellt. Erkennbar an CollapsiblePanel-Widgets für Events und an rohem `<strong>`-HTML für Bekanntmachungen.

**Events — CollapsiblePanel:**

| Element | Selektor |
|---------|----------|
| Container | `<div class="CollapsiblePanelTab">` |
| Datum/Uhrzeit | `<strong>DD.MM.YYYY[, HH:MM Uhr] \|</strong>` |
| Titel | Text nach `</strong>` bis `</div>` |
| URL | Listenseiten-URL (keine Einzelseiten) |
| ID | `{ortsname}-event-{YYYYMMDD}-{titel-slug}` |

**Bekanntmachungen — rohe `<strong>`-Formatierung:**

| Element | Selektor |
|---------|----------|
| Datum | `DD.MM.YYYY<br />` vor `<strong>` |
| Anker | `<a name="ANCHOR">` optional vor dem Datum |
| Titel | Inhalt von `<strong>...</strong>` (nach Strip von Tags) |
| URL | `{SEITE_URL}#ANCHOR` wenn Anker vorhanden, sonst Seitenurl |

Beispiel: Amt Schlieben (`amt-schlieben.de`)

---

## Advantic / ScreendriverFOUR (mit windows-1252 Encoding)

Advantic-CMS-Installationen (auch unter dem Namen „ScreendriverFOUR") nutzen teilweise ISO-8859-15 / windows-1252 Zeichenkodierung statt UTF-8.

**Erkennungsmerkmale:**
- Antwortheader `Content-Type: text/html; charset=windows-1252` oder `charset=iso-8859-15`
- FID-basierte News-URLs: `FID={SEITENID}.{ITEMID}.1`
- `<h3 class="list-title">` für Titel, `<time datetime="YYYY-MM-DD">` für Datum
- Pagination via `?start=N` oder `?page=N` (IKISS-ähnlich)

**Dekodierung:**

```typescript
const bytes = Buffer.from(await r.arrayBuffer());
return new TextDecoder("windows-1252").decode(bytes);
```

**News-Parsing:**

| Element | Selektor |
|---------|----------|
| Container | `<li>` mit `FID={SEITEN_ID}.` |
| FID | `FID={SEITEN_ID}\.(\d+)\.1` → Item-ID |
| URL | `href="[^"]+FID={SEITEN_ID}\.{ID}\.1[^"]*"` → `{BASE_URL}{href}` |
| Titel | `<h3 class="list-title">Text</h3>` oder `title="..."` Fallback |
| Datum | `<time datetime="YYYY-MM-DD">` → direkt als ISO-Datum |

Beispiele: Finsterwalde (`finsterwalde.de`, Seiten-ID 3652), Rietz-Neuendorf, Kleinmachnow

---

## IKISS (lkee.de-Variante)

IKISS ist ein älteres kommunales CMS-System, das windows-1252 Encoding verwendet. Die Landkreis-Elbe-Elster-Variante hat spezifische HTML-Strukturen.

**Erkennungsmerkmale:**
- `Content-Type: text/html; charset=windows-1252`
- News: `<div class="date">DD.MM.YYYY</div>` direkt vor `<h4><a href="...">`
- Events: `<ul data-role="listview">` mit `<li><h3><a>` und Datum in `<p>`
- Amtsblatt: PDF-Links mit Unix-Timestamp im Query-Parameter `?{unix_ts}`

**Dekodierung:** identisch zu Advantic — `TextDecoder("windows-1252")`

**News-Parsing:**

| Element | Selektor |
|---------|----------|
| Muster | `<div class="date">DD.MM.YYYY</div>\s*<h4><a href="URL">(Titel)</a></h4>` |
| FID | `FID=2112\.(\d+)\.1` aus URL |
| ID | `lkee-news-{FID}` |

**Events-Parsing:**

| Element | Selektor |
|---------|----------|
| Muster | `<li>\s*<h3><a href="URL">(Titel)</a></h3>[\s\S]*?<p>\s*DD.MM.YYYY[ bis DD.MM.YYYY]?` |
| Datum | `(\d{2})\.(\d{2})\.(\d{4})` für Start; optionales `bis DD.MM.YYYY` für Ende |
| FID | `FID=2112\.(\d+)\.1` aus URL |

**Amtsblatt-Parsing:**

| Element | Selektor |
|---------|----------|
| Muster | `<li><a href="/media/custom/2112_{ID}_1.PDF?{unix_ts}">(Amtsblatt/Kreisanzeiger Text)</a></li>` |
| Datum | `new Date(parseInt(unix_ts) * 1000).toISOString()` |
| Hinweis | Kein explizites Datum im HTML — Unix-Timestamp im URL-Query einzige Datumsquelle |

Pagination: IKISS hat keine URL-basierte Pagination — alle Seiten zeigen max. 15 Einträge. Incremental scraping (vorhandene Daten behalten) ist Pflicht.
Beispiel: Landkreis Elbe-Elster (`lkee.de`, 15 News, 15 Events, 64 Amtsblätter)
