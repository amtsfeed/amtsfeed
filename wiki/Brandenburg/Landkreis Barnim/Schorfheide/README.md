# Schorfheide

Gemeinde Schorfheide, Landkreis Barnim, Brandenburg.

## Sources

| Type       | URL                                                                        |
|------------|----------------------------------------------------------------------------|
| Events     | https://www.schorfheide.de/veranstaltungen.html                            |
| Amtsblatt  | https://www.gemeinde-schorfheide.de/startseite/aktuell/amtsblatt           |

## CMS

**Joomla** with the **screendriverFOUR-Events** template.

Events are rendered server-side in a single HTML page with `div.eventbox schatten` containers. Each event block contains the date, time, title, location, and a link using the `se=` event ID parameter. Unlike Panketal, Schorfheide uses `<h3>` for event titles instead of `<h2>`.

## Data quality

- **Events:** 226 items found on initial scrape (May 2026 onwards; large dataset covering many months)
- **News:** Not available; news.json contains an empty items array
- Locations are present for most events
- Time of day is provided for most events

## Amtsblatt

- Listing URL: `https://www.gemeinde-schorfheide.de/startseite/aktuell/amtsblatt`
- The scraper fetches the main page (current year) plus the previous year sub-page (`/amtsblatt-YYYY`).
- PDF links match `<a href="/fileadmin/...Amtsblatt...\.pdf">` with link text like "Amtsblatt März 2026, Nr. 03/2026 (20.03.2026)".
- Nr. and year are extracted from the `Nr. NN/YYYY` pattern; publishedAt comes from the `(DD.MM.YYYY)` parenthetical.
- IDs follow the pattern `schorfheide-amtsblatt-YYYY-NN`.
- 14 entries found on initial scrape (2025–2026).

## Validation hints

- Event IDs are numeric `se=` values from the Joomla events plugin (Tourism Data Hub / TDH integration)
- Schorfheide is a large municipality with many events — the high event count (226) is expected
- If the event count drops to 0, check whether the HTML class changed from `eventbox schatten` to another pattern
- Title tag is `<h3>` (the scraper uses a `<h[23]>` regex to handle both `h2` and `h3`)
- robots.txt is fetched and cached in `robots.json`; the scraper enforces `assertAllowed(["/veranstaltungen.html"])`
