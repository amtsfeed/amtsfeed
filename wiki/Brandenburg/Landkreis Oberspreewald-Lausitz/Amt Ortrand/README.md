# Amt Ortrand

- **Website:** https://amt-ortrand.de
- **CMS:** WordPress (seit Juni 2026; vorher Joomla! + JEvents)
- **Landkreis:** Oberspreewald-Lausitz, Brandenburg
- **Mitgliedsgemeinden:** Ortrand, Frauendorf, Großkmehlen, Kroppen, Lindenau, Tettau

## Datenquellen

| Quelle    | URL                                                | Felder                                        |
|-----------|----------------------------------------------------|-----------------------------------------------|
| News      | `/wp-json/wp/v2/posts` (REST-API, 50 Beiträge)     | `slug`, `title`, `link`, `date`, `excerpt`    |
| Amtsblatt | `/amtsblaetter/`                                   | Titel, Erscheinungsdatum, direkter PDF-Link   |

## Besonderheiten

- **Relaunch 2026:** Die Seite ist von Joomla auf WordPress umgezogen. Die alten Pfade
  (`/veranstaltungen`, `/downloads/amtsblätter`) liefern 404, ebenso die `www.`-Variante der Domain.
- **Keine Veranstaltungen mehr:** Der JEvents-Kalender ist ersatzlos entfallen; es gibt nur noch
  einen Sitzungskalender. `events.json` bleibt als Archiv bestehen, wird aber nicht fortgeschrieben.
- Amtsblatt-Einträge stehen als Linkliste mit Titelformat
  `Amtsblatt Nr. N – Monat – DD.MM.YYYY`; die PDFs liegen unter `/wp-content/uploads/{YYYY}/{MM}/`.
  Gelegentlich erscheinen Sonderausgaben ("Sonderblatt – Rück und Blick").
- robots.txt sperrt nur `/wp-admin/`, die REST-API ist also nutzbar.
- Keine strukturierte Liste öffentlicher Bekanntmachungen, daher kein `notices.json`.

## ID-Konvention

- `ortrand-news-{slug}` (WordPress-Slug, deckungsgleich mit den Joomla-IDs aus der Altbestand)
- `ortrand-amtsblatt-{YYYY}-{MM}` (aus dem Erscheinungsdatum, damit der Merge mit dem Altbestand greift)

## Validierung

Das Scraping funktioniert noch, wenn:
1. `pnpm tsx index.ts` ohne Fehler läuft und `news: N` (N ≥ 5) sowie `amtsblatt: N` (N ≥ 50) ausgibt
2. Falls news = 0: prüfen, ob `/wp-json/wp/v2/posts` noch JSON liefert
3. Falls amtsblatt = 0: prüfen, ob auf `/amtsblaetter/` noch PDF-Links mit Datum im Linktext stehen
