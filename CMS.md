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
