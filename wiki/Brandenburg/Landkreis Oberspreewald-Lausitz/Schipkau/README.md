# Gemeinde Schipkau

- **Website:** https://www.gemeinde-schipkau.de (Domain `schipkau.de` ohne `www.gemeinde-` redirected nicht; die Gemeinde nutzt ausschließlich die `www.gemeinde-schipkau.de`-Variante.)
- **CMS:** PortUNA (verwaltungsportal.de)
- **Landkreis:** Oberspreewald-Lausitz, Brandenburg
- **Ortsteile:** Schipkau, Klettwitz, Annahütte, Hörlitz, Drochow, Meuro

## Datenquellen

| Quelle      | URL                                                                  | Felder                                                 |
|-------------|----------------------------------------------------------------------|--------------------------------------------------------|
| News        | `/news/1`                                                            | Titel, URL, `publishedAt` (aus Vorschau-Text "DD.MM.YYYY:"), Beschreibung |
| Events      | `/veranstaltungen/index.php`                                         | Titel, URL, Datum (aus URL-Pfad), Ort (`<address>`), Beschreibung (`vorschau`) |
| Amtsblatt   | `/amtsblatt/index.php`                                               | Nr./Jahrgang, Erscheinungsdatum aus PortUNA-Tabelle    |

## Besonderheiten

- PortUNA Events-Variante `event-entry-div` (Schipkau verwendet nicht das `event-box`-Template).
  Die Events-Liste enthält Datum (`<time datetime="YYYY-MM-DD">`) und Titel; Uhrzeiten kommen aus den
  Detailseiten und werden hier nicht gescraped — alle Events bekommen `00:00:00` UTC.
- News und Amtsblatt verwenden die Standard-PortUNA-Templates (`news-entry-to-limit`,
  `<td>Nr. X/YYYY</td><td>DD.MM.YYYY</td>`).
- Amtsblatt-URLs zeigen auf das Listing — die direkten PDF-Links liegen hinter Klick-Handlern.
- `/bekanntmachungen/index.php` enthält keine strukturierte Liste, daher wird `notices.json` nicht
  erzeugt.

## ID-Konvention

- `schipkau-event-{portuna-id}`
- `schipkau-news-{portuna-id}`
- `schipkau-amtsblatt-{YYYY}-{NN}`
