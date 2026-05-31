#!/usr/bin/env tsx
/**
 * Scraper for Amt Ruhland — ionas4 CMS
 * https://www.amt-ruhland.de
 *
 * News:      RSS feed /nachrichten-amt-ruhland/rss.xml (real publishedAt).
 * Events:    JSON endpoint /kalender/events.json?weekends=false&tagMode=ALL
 *            (id, start, end, title, location, website, tags).
 * Amtsblatt: JSON endpoint /amtsverwaltung/amtsblatt/downloadItems.json?…
 *            Items have fileName "Amtsblatt Ruhland_Monat YYYY.pdf" with
 *            fileCreatedTimestamp (ms epoch) and absolute downloadHref.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-ruhland.de";
const NEWS_RSS_URL = `${BASE_URL}/nachrichten-amt-ruhland/rss.xml`;
const EVENTS_JSON_URL = `${BASE_URL}/kalender/events.json?weekends=false&tagMode=ALL`;
// downloadItems endpoint is dynamic per page; the id (component-id) and i4xpath
// are stable for the published amtsblatt module. They were extracted from the
// rendered /amtsverwaltung/amtsblatt/ page on 2026-05-31.
const AMTSBLATT_JSON_URL =
  `${BASE_URL}/amtsverwaltung/amtsblatt/downloadItems.json` +
  `?i4xpath=656c38264d4f433b614e64336435493f33344b72595a4e663c5a546d2d65264b385c73743c6d252248724b3e656935386b28386a3d494c7a5846553851685778626e7739277873323c38415e6034567542453f6f2f4d79612947573d693d6a3c603e5a796f53756d` +
  `&h=1&h_=1&id=9b88ce71f876b7e59ebcae3ccfb8ade2`;
const AMTSBLATT_PAGE_URL = `${BASE_URL}/amtsverwaltung/amtsblatt/`;
const ID_PREFIX = "ruhland";
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News (RSS) ────────────────────────────────────────────────────────────────
function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]!;

    const titleM = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkM = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
    const pubM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const dcDateM = block.match(/<dc:date>([\s\S]*?)<\/dc:date>/);
    if (!titleM || !linkM) continue;

    const title = decodeHtmlEntities((titleM[1] ?? "").trim());
    const url = decodeHtmlEntities((linkM[1] ?? "").trim());
    if (!title || !url) continue;

    // Stable id from the URL slug
    const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug) continue;
    const id = `${ID_PREFIX}-news-${slug.slice(0, 100)}`;

    let publishedAt: string | undefined;
    const dateStr = (dcDateM ? dcDateM[1] : pubM ? pubM[1] : undefined)?.trim();
    if (dateStr) {
      try { publishedAt = new Date(dateStr).toISOString(); } catch { /* ignore */ }
    }

    items.push({
      id,
      title,
      url,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items;
}

// ── Events (JSON) ─────────────────────────────────────────────────────────────
interface RuhlandEventJson {
  id: string;
  start: string; // "YYYY-MM-DDTHH:MM" (local; treated as Europe/Berlin)
  end: string;
  allDay: boolean;
  title: string;
  website?: string;
  location?: { name?: string };
  tags?: { name: string }[];
}

function localToUtcIso(local: string, allDay: boolean): string {
  // The API returns naive "YYYY-MM-DDTHH:MM" without timezone — interpret as
  // Europe/Berlin. To keep deterministic ISO output, treat the local clock as
  // UTC (the downstream feed displays the date/time as-is). This matches how
  // other ionas4 scrapers in this repo treat naïve local times.
  if (allDay && local.endsWith("T00:00")) {
    return `${local.slice(0, 10)}T00:00:00.000Z`;
  }
  return `${local}:00.000Z`;
}

function extractEvents(json: RuhlandEventJson[]): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const e of json) {
    if (!e.id || !e.start || !e.title) continue;
    const stableId = e.id.split(":")[0]!;
    const id = `${ID_PREFIX}-event-${stableId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const startDate = localToUtcIso(e.start, e.allDay);
    const endDate = e.end ? localToUtcIso(e.end, e.allDay) : undefined;
    const location = e.location?.name?.trim() || undefined;
    // tags can hint at ortsteil; include if not in title/location
    const tagNames = (e.tags ?? []).map((t) => t.name).filter(Boolean);
    const description = tagNames.length ? `Schlagworte: ${tagNames.join(", ")}` : undefined;

    // Detail URL: prefer "website" if set; otherwise link to calendar page
    const url = (e.website && e.website.trim()) || `${BASE_URL}/veranstaltungen/`;

    events.push({
      id,
      title: e.title.trim(),
      url,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── Amtsblatt (JSON) ──────────────────────────────────────────────────────────
interface RuhlandDownloadItem {
  fileName: string;
  filePathName: string;
  downloadHref: string;
  fileCreated?: string; // "DD.MM.YYYY, HH:MM"
  fileCreatedTimestamp?: number;
  fileType?: string;
}

interface RuhlandDownloadsJson {
  downloadItems: RuhlandDownloadItem[];
}

const GERMAN_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

function extractAmtsblatt(json: RuhlandDownloadsJson): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const item of json.downloadItems ?? []) {
    if (item.fileType && item.fileType !== "pdf") continue;
    const name = item.fileName ?? "";
    if (!/amtsblatt/i.test(name)) continue;

    // "Amtsblatt Ruhland_April 2026.pdf" → Monat / Jahr
    const m = name.match(/_?([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
    if (!m) continue;
    const monthName = m[1]!.toLowerCase();
    const year = m[2]!;
    const monthNum = GERMAN_MONTHS[monthName];
    if (!monthNum) continue;

    const publishedAt = `${year}-${monthNum}-01T00:00:00.000Z`;
    const id = `${ID_PREFIX}-amtsblatt-${year}-${monthNum}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = item.downloadHref || `${AMTSBLATT_PAGE_URL}${item.filePathName ?? ""}`;
    const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    items.push({
      id,
      title: `Amtsblatt Ruhland ${monthLabel} ${year}`,
      url,
      publishedAt,
      fetchedAt: now,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
    else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return b.id.localeCompare(a.id);
  });
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/nachrichten-amt-ruhland/rss.xml", "/kalender/events.json", "/amtsverwaltung/amtsblatt/"]);

const headers = { "User-Agent": AMTSFEED_UA };

const [newsXml, eventsRaw, amtsblattRaw] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(EVENTS_JSON_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_JSON_URL}`); return r.text(); }),
  fetch(AMTSBLATT_JSON_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_JSON_URL}`); return r.text(); }),
]);

const eventsJson = JSON.parse(eventsRaw) as RuhlandEventJson[];
const amtsblattJson = JSON.parse(amtsblattRaw) as RuhlandDownloadsJson;

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsJson));
const mergedNews = mergeNews(existingNews.items, extractNews(newsXml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattJson));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
