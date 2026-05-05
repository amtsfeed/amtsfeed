# Panketal

Gemeinde Panketal, Landkreis Barnim, Brandenburg.

## Sources

| Type   | URL                                              |
|--------|--------------------------------------------------|
| Events | https://panketal.de/freizeit/veranstaltungen.html |

## CMS

**Joomla** with the **screendriverFOUR-Events** template.

Events are rendered server-side in a single HTML page with `div.eventbox schatten` containers. Each event block contains the date, time, title, location, and a link using the `se=` event ID parameter.

## Data quality

- **Events:** 16 items found on initial scrape (May 2026 – September 2026)
- **News:** Not available (page is empty on this site; news.json contains an empty items array)
- Locations are present for all events
- Time of day is provided for most events

## Validation hints

- Event IDs are numeric `se=` values from the Joomla events plugin (Tourism Data Hub / TDH integration)
- If the event count drops to 0, check whether the HTML class changed from `eventbox schatten` to another pattern
- The site uses the Tourism Data Hub CDN for event images (`assets.tourism-data-hub.de`)
- robots.txt is fetched and cached in `robots.json`; the scraper enforces `assertAllowed(["/freizeit/veranstaltungen.html"])`
