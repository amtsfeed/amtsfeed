# Brieselang (Landkreis Havelland)

Amtsfreie Gemeinde im Landkreis Havelland, Brandenburg.

- **Website:** https://www.gemeindebrieselang.de (Ursprungs-Domain `www.brieselang.de` leitet hierhin um)
- **CMS:** **active-City** (ColdFusion-basiert, `Generated with active-City 3.115.0`)
- **Identifikation:** `class="ac_teaser_item"`, `event_wrapper teaser_element`, URL `/city_info/display/dokument/show.cfm?…`

## Datenquellen

| Kategorie | URL | Variante |
|-----------|-----|----------|
| News | `/Aktuelles/Aktuelle-Meldungen.htm` | `<div class="ac_teaser_item item_{ID}">` mit `<h3 class="ac_teaser_title">`, `<div class="ac_teaser_date">Datum DD.MM.YYYY</div>`, `<span class="text_wrapper">…` |
| Events | `/Aktuelles/Veranstaltungen.htm` | `<div class="event_wrapper teaser_element">` mit `event_teaser_title_link`, `event_date_from`/`event_date_to` (Wochentag + DD. Monatsname, **ohne Jahr**) |
| Amtsblatt | `/Seiten/Amtsblaetter-der-Gemeinde-Brieselang.html` (aktuelles Jahr) + `/Seiten/Amtsblaetter-YYYY.html` (letzte 3 Vorjahre) | Linkliste mit `/city_info/display/dokument/show.cfm?region_id=342&id=NNN` und Linktext `Amtsblatt MM/YYYY vom DD. Monatsname YYYY` |

## Besonderheiten

- **Wichtig:** Der ColdFusion-Server liefert bei einer normalen `curl`-Anfrage einen leeren Body (0 Bytes) zurück. Der Inhalt wird **nur dann ausgeliefert, wenn der Client `Accept-Encoding: gzip` mit‐sendet**. Node `fetch` macht das automatisch — bei Tests mit `curl` muss `--compressed` oder `-H "Accept-Encoding: gzip"` gesetzt werden.
- Events haben im HTML **kein Jahr** — der Scraper wendet eine Heuristik an: liegt das Datum mehr als 60 Tage in der Vergangenheit (relativ zum Abruftag), wird das Folgejahr angenommen, sonst das aktuelle Jahr.
- Sonderamtsblätter werden mit gesondertem ID-Prefix (`brieselang-amtsblatt-sonder-…`) gespeichert.
- Keine Bekanntmachungen-Rubrik mit eigener Seite gefunden (Amtsblatt + News-Mitteilungen reichen ab).

## Datenqualität

| Kategorie | Anzahl beim Erstabruf |
|-----------|-----------------------|
| News | 20 |
| Events | 20 |
| Amtsblatt | 42 (aktuelles Jahr + 3 Vorjahre, archiviert bis 2007 unter `/Seiten/Amtsblaetter-YYYY.html`) |
