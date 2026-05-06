#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://panketal.de";
const EVENTS_URL = `${BASE_URL}/freizeit/veranstaltungen.html`;
const AMTSBLATT_URL = `${BASE_URL}/rathaus/amtsblatt.html`;
const AMTSBLATT_FEED_URL = `${BASE_URL}/rathaus/amtsblatt.feed?type=rss`;
const NOTICES_FEED_URL = `${BASE_URL}/rathaus/oeffentliche-bekanntmachungen.feed?type=rss`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Joomla + screendriverFOUR-Events template
// Container: <div class="col-xs-12 eventbox ...">
// Date: <p class="dat"><strong>DD.MM.YYYY</strong> | HH:MM Uhr</p>
// Title: <h2>TITLE</h2>
// Location: <p class="place"><img ...> <strong>LOCATION</strong></p>
// URL: href="/freizeit/veranstaltungen/eventdetail-laden.html?se=ID"

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString();

  // Split on eventbox class substring to get individual event blocks
  // The actual class is "col-xs-12 eventbox schatten ..."
  const blocks = html.split("eventbox schatten").filter((_, i) => i > 0);

  for (const block of blocks) {
    // Extract event ID from se= parameter
    const idMatch = block.match(/se=(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Extract date: <strong>DD.MM.YYYY</strong>
    const dateMatch = block.match(/<strong>(\d{1,2})\.(\d{1,2})\.(\d{4})<\/strong>/);
    if (!dateMatch) continue;
    const [, day, month, year] = dateMatch;
    const dateStr = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;

    // Extract time: | HH:MM Uhr
    const timeMatch = block.match(/\|\s*(\d{1,2}:\d{2})\s*Uhr/);
    const time = timeMatch ? timeMatch[1]!.padStart(5, "0") : "00:00";
    const startDate = `${dateStr}T${time}:00.000Z`;

    // Extract title from <h2>
    const titleMatch = block.match(/<h2>([\s\S]*?)<\/h2>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Extract location from class="place" block
    const placeMatch = block.match(/class="place"[\s\S]*?<strong>([^<]+)<\/strong>/);
    const location = placeMatch
      ? decodeHtmlEntities(placeMatch[1]!.trim()) || undefined
      : undefined;

    // Extract URL
    const hrefMatch = block.match(/href="([^"]*se=\d+[^"]*)"/);
    const url = hrefMatch ? `${BASE_URL}${hrefMatch[1]!}` : EVENTS_URL;

    events.push({
      id,
      title,
      url,
      startDate,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Joomla RSS feed at /rathaus/amtsblatt.feed?type=rss
// Each <item> covers one year: <title>Amtsblatt YYYY</title>
// CDATA <description> contains <li><a href="PDF_URL">Amtsblatt Nummer NN</a></li>
// No publication dates per issue → use YYYY-01-01

function extractAmtsblatt(rss: string): AmtsblattItem[] {
  const items = new Map<string, AmtsblattItem>();
  const now = new Date().toISOString();

  // Split into RSS <item> blocks and find year-based ones
  const blocks = rss.split(/<item>/).filter((b) => b.includes("<title>Amtsblatt 20"));

  for (const block of blocks) {
    const yearMatch = block.match(/<title>Amtsblatt (\d{4})<\/title>/);
    if (!yearMatch) continue;
    const year = yearMatch[1]!;

    // Extract CDATA content
    const cdataMatch = block.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (!cdataMatch) continue;
    const cdata = cdataMatch[1]!;

    // Extract PDF links with their list-item label
    const linkRx = /href="(https?:\/\/panketal\.de\/[^"]+\.pdf)"[^>]*>([^<]*)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRx.exec(cdata)) !== null) {
      const url = m[1]!;
      const label = m[2]!.trim();
      const numMatch = label.match(/Nummer\s+(\d+)/i);
      if (!numMatch) continue;
      const num = numMatch[1]!.padStart(2, "0");
      const id = `panketal-amtsblatt-${year}-${num}`;
      if (!items.has(id)) {
        items.set(id, {
          id,
          title: `Amtsblatt Nr. ${num}/${year}`,
          url,
          publishedAt: `${year}-01-01T00:00:00.000Z`,
          fetchedAt: now,
        });
      }
    }
  }

  return [...items.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Joomla RSS feed at /rathaus/oeffentliche-bekanntmachungen.feed?type=rss
// Each <item> covers a year. CDATA <description> contains a <table> with rows:
//   <td colspan="2"><strong>DD.MM.YYYY</strong> - TITLE<br/><a href="PDF">Download</a></td>
// pubDate of the RSS item is NOT the notice date — use the date from <strong>.

function extractNotices(rss: string): NoticeItem[] {
  const items = new Map<string, NoticeItem>();
  const now = new Date().toISOString();

  // Split into RSS <item> blocks
  const rssBlocks = rss.split(/<item>/).slice(1);

  for (const block of rssBlocks) {
    // Extract CDATA content
    const cdataMatch = block.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (!cdataMatch) continue;
    const cdata = cdataMatch[1]!;

    // Each table row: <td ...><strong>DD.MM.YYYY</strong> - TITLE<br /><a href="PDF">Download</a>
    const rowRx = /<td[^>]*>[\s\S]*?<strong[^>]*>(\d{1,2})\.(\d{2})\.(\d{4})<\/strong>\s*[-–]\s*([\s\S]*?)<br\s*\/?>\s*<a\s+href="([^"]+)"[^>]*>Download<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRx.exec(cdata)) !== null) {
      const day = m[1]!.padStart(2, "0");
      const month = m[2]!;
      const year = m[3]!;
      const publishedAt = `${year}-${month}-${day}T00:00:00.000Z`;

      const rawTitle = m[4]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const title = decodeHtmlEntities(rawTitle);
      if (!title) continue;

      const href = m[5]!;
      const pdfUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      // Stable id from PDF filename
      const slug = pdfUrl.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(-80);
      const id = `panketal-notice-${slug}`;
      if (!items.has(id)) {
        items.set(id, { id, title, url: pdfUrl, publishedAt, fetchedAt: now });
      }
    }
  }

  return [...items.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/freizeit/veranstaltungen.html", "/rathaus/amtsblatt.html", "/rathaus/oeffentliche-bekanntmachungen.html"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, amtsblattRss, noticesRss] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_FEED_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_FEED_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattRss));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesRss));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

// Write empty news.json if it doesn't exist
if (!existsSync(newsPath)) {
  writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: [] } satisfies NewsFile, null, 2));
}

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       0 Einträge (keine Nachrichten) → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
