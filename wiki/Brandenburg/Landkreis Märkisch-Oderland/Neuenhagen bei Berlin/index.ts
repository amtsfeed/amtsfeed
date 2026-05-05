#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.neuenhagen-bei-berlin.de";
const EVENTS_DISCOVERY_URL = `${BASE_URL}/startseite-de/freizeit-tourismus/veranstaltungen/`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const AMTSBLATT_URL = `${BASE_URL}/startseite-de/politik-verwaltung/rathaus/amtsblatt/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", maerz: "03", märz: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08", september: "09",
  oktober: "10", november: "11", dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// ionas4 CMS — events are manually maintained as text paragraphs on a
// veranstaltungstermine page. Date formats:
//   "D. MMMM"          →  D. Januar / 28. März
//   "DD.MM."           →  18.4. / 26.4.
//   "DD.MM. – DD.MM."  →  1.6. – 6.6.
//   "D.–D.MM"          →  28. – 29.11

function parseDayMonth(day: string, month: string, year: number): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractEvents(html: string, pageUrl: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  // Determine year from URL (veranstaltungstermine-YYYY-1)
  const yearMatch = pageUrl.match(/veranstaltungstermine-(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]!) : new Date().getFullYear();

  // Extract all <p class="paragraph"> text nodes
  const paraRx = /<p\s+class="paragraph">([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = paraRx.exec(html)) !== null) {
    const text = decodeHtmlEntities((m[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!text || text.length < 5) continue;

    // Try date patterns
    let startDate: string | undefined;
    let endDate: string | undefined;
    let title: string | undefined;

    // Pattern: "D. – D.MM" or "D. - D.MM"  e.g. "28. – 29.11"
    const rangeNoYear = text.match(/^(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.?\s+(.+)/);
    if (rangeNoYear) {
      const [, d1, d2, mo, rest] = rangeNoYear;
      startDate = parseDayMonth(d1!, mo!, year);
      endDate = parseDayMonth(d2!, mo!, year);
      title = rest!.trim();
    }

    if (!startDate) {
      // Pattern: "DD.MM. – DD.MM." or "DD.MM. - DD.MM."  e.g. "1.6. – 6.6."
      const rangeNumeric = text.match(/^(\d{1,2})\.(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.\s+(.+)/);
      if (rangeNumeric) {
        const [, d1, m1, d2, m2, rest] = rangeNumeric;
        startDate = parseDayMonth(d1!, m1!, year);
        endDate = parseDayMonth(d2!, m2!, year);
        title = rest!.trim();
      }
    }

    if (!startDate) {
      // Pattern: "DD.MM." numeric  e.g. "18.4." or "07.10."
      const numeric = text.match(/^(\d{1,2})\.(\d{1,2})\.\s+(.+)/);
      if (numeric) {
        const [, d, mo, rest] = numeric;
        startDate = parseDayMonth(d!, mo!, year);
        title = rest!.trim();
      }
    }

    if (!startDate) {
      // Pattern: "D. MMMM" full German month  e.g. "1. Januar" or "28. März"
      const fullMonth = text.match(/^(\d{1,2})\.\s+([A-Za-zäöüÄÖÜß]+)\s+(.+)/);
      if (fullMonth) {
        const [, d, monthName, rest] = fullMonth;
        const mo = GERMAN_MONTHS[monthName!.toLowerCase()];
        if (mo) {
          startDate = parseDayMonth(d!, mo, year);
          title = rest!.trim();
        }
      }
    }

    if (!startDate || !title) continue;

    // Skip generic entries without meaningful titles
    if (title.length < 3) continue;

    const id = `neuenhagen-event-${year}-${String(++idx).padStart(3, "0")}`;

    events.push({
      id,
      title,
      url: pageUrl,
      startDate: `${startDate}T00:00:00.000Z`,
      ...(endDate ? { endDate: `${endDate}T00:00:00.000Z` } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// ionas4 CMS — news from sitemap + individual page JSON-LD
// Sitemap URL: /sitemap.xml (500KB+)
// News URLs: /startseite-de/aktuelles/YYYY/[MONTH-YYYY/]SLUG/
// JSON-LD: <script type="application/ld+json">[...,{"headline":"...","datePublished":"..."}]</script>

const NEWS_LIMIT = 20;

interface SitemapEntry { url: string; lastmod: string }

function parseSitemapNewsUrls(xml: string): SitemapEntry[] {
  const items: SitemapEntry[] = [];
  const blockRx = /<url>([\s\S]*?)<\/url>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRx.exec(xml)) !== null) {
    const block = m[1]!;
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (!locMatch) continue;
    const url = locMatch[1]!.trim();
    // Only news article pages (not year pages, not PDFs/attachments)
    if (!url.includes("/startseite-de/aktuelles/")) continue;
    if (/\.(pdf|jpg|png|svg|webp|docx?|xlsx?)(\?|$)/i.test(url)) continue;
    // Exclude year-only pages like /aktuelles/2026/
    if (/\/aktuelles\/\d{4}\/$/.test(url)) continue;
    // Exclude archiv pages
    if (url.includes("/archiv/")) continue;
    const lastmod = lastmodMatch?.[1]?.trim() ?? "";
    items.push({ url, lastmod });
  }
  // Sort by lastmod descending
  return items.sort((a, b) => b.lastmod.localeCompare(a.lastmod)).slice(0, NEWS_LIMIT);
}

function extractJsonLdHeadlineAndDate(html: string): { headline?: string; datePublished?: string } {
  const scriptMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return {};
  const headlineMatch = scriptMatch[1]!.match(/"headline":"([^"]+)"/);
  const dateMatch = scriptMatch[1]!.match(/"datePublished":"([^"]+)"/);
  const urlMatch = scriptMatch[1]!.match(/"url":"(https:[^"]+\/aktuelles\/[^"]+)"/);
  if (!headlineMatch || !urlMatch) return {};
  const headline = decodeHtmlEntities(headlineMatch[1]!.replace(/\\u([\dA-F]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  const datePublished = dateMatch ? dateMatch[1]!.substring(0, 10) : undefined;
  return { headline, datePublished };
}

function slugToId(url: string): string {
  return url.replace(/^https:\/\/[^/]+\//, "").replace(/\/$/, "").replace(/\//g, "-");
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// ionas4 CMS — PDFs at /startseite-de/politik-verwaltung/rathaus/amtsblatt/
// Filename patterns:
//   digitales-amtsblatt-jg-31-NN-YYYY.pdf  → month = NN (numeric, 2026+)
//   amtsblatt-MONTHNAME-YYYY-final.pdf      → month from name (2025)
//   final-digitales-amtsblatt-NN-YYYY.pdf  → month = NN (2025)
// ?cid=XXX is a stable Contao content ID — keep in URL

const NEUENHAGEN_MONTH_NAMES: Record<string, string> = {
  januar: "01", februar: "02", maerz: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", dezember: "12",
};

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items = new Map<string, AmtsblattItem>();
  const now = new Date().toISOString();
  const rx = /href="(https:\/\/www\.neuenhagen-bei-berlin\.de\/startseite-de\/politik-verwaltung\/rathaus\/amtsblatt\/([^"?#]+\.pdf)[^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!;
    const raw = m[2]!.toLowerCase().replace(/\.pdf$/, "");
    let year: string | undefined;
    let month: string | undefined;

    // jg-NN-MM-YYYY (e.g. jg-31-04-2026)
    const jgMatch = raw.match(/jg-\d+-(\d{2})-(\d{4})/);
    if (jgMatch) { month = jgMatch[1]!; year = jgMatch[2]!; }

    // NN-YYYY at end of numeric segment (e.g. 12-2025)
    if (!month) {
      const numMatch = raw.match(/(\d{2})-(\d{4})/);
      if (numMatch) { month = numMatch[1]!; year = numMatch[2]!; }
    }

    // Month name in filename
    if (!month) {
      for (const [name, num] of Object.entries(NEUENHAGEN_MONTH_NAMES)) {
        if (raw.includes(name)) {
          month = num;
          year = raw.match(/(\d{4})/)?.[1];
          break;
        }
      }
    }

    if (!month || !year) continue;
    const id = `neuenhagen-amtsblatt-${year}-${month}`;
    if (!items.has(id)) {
      items.set(id, { id, title: `Amtsblatt Nr. ${month}/${year}`, url, publishedAt: `${year}-${month}-01T00:00:00.000Z`, fetchedAt: now });
    }
  }
  return [...items.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  // Events are re-indexed each run (no stable IDs), keep all incoming
  return incoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) {
      byId.set(n.id, n);
    } else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
      return 0;
    })
    .slice(0, NEWS_LIMIT);
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, [
  "/startseite-de/freizeit-tourismus/veranstaltungen/",
  "/startseite-de/aktuelles/",
  "/startseite-de/politik-verwaltung/",
  "/sitemap.xml",
]);

const headers = { "User-Agent": AMTSFEED_UA };

// Discover veranstaltungstermine URL
const discoveryHtml = await fetch(EVENTS_DISCOVERY_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_DISCOVERY_URL}`);
  return r.text();
});
const eventsLinkMatch = discoveryHtml.match(/href="(https:\/\/www\.neuenhagen-bei-berlin\.de\/startseite-de\/[^"]*veranstaltungstermine[^"]*)"/);
if (!eventsLinkMatch) throw new Error("Could not find veranstaltungstermine link");
const EVENTS_URL = eventsLinkMatch[1]!;

// Fetch events page + sitemap + amtsblatt in parallel
const [eventsHtml, sitemapXml, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`);
    return r.text();
  }),
  fetch(SITEMAP_URL, { headers }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${SITEMAP_URL}`);
    return r.text();
  }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

// Get recent news URLs from sitemap
const newsEntries = parseSitemapNewsUrls(sitemapXml);

// Fetch individual news articles to get titles
const newsItems: NewsItem[] = [];
const now = new Date().toISOString();
await Promise.all(
  newsEntries.map(async ({ url, lastmod }) => {
    const html = await fetch(url, { headers }).then((r) => r.ok ? r.text() : "");
    const { headline, datePublished } = extractJsonLdHeadlineAndDate(html);
    if (!headline) return;
    const id = slugToId(url);
    const publishedAt = datePublished ? `${datePublished}T00:00:00.000Z` : (lastmod ? lastmod.substring(0, 10) + "T00:00:00.000Z" : undefined);
    newsItems.push({ id, title: headline, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  })
);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml, EVENTS_URL));
const mergedNews = mergeNews(existingNews.items, newsItems);
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
