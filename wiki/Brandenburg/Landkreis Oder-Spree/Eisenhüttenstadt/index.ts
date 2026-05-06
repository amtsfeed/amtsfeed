#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.eisenhuettenstadt.de";
const EVENTS_RSS_URL = `${BASE_URL}/media/rss/Veranstaltungsueberblick.xml`;
const NEWS_RSS_URL = `${BASE_URL}/media/rss/Pressemitteilungen.xml`;
const AMTSBLATT_URL = `${BASE_URL}/Rathaus/Aktuelles-Presse/Amtsblatt/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "\u00e4").replace(/&ouml;/g, "\u00f6").replace(/&uuml;/g, "\u00fc")
    .replace(/&Auml;/g, "\u00c4").replace(/&Ouml;/g, "\u00d6").replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/g, "\u00df").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&bdquo;/g, "\u201e").replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
    .replace(/&ndash;/g, "\u2013").replace(/&mdash;/g, "\u2014")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

async function fetchLatin1(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const buf = await r.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

// ── Events ────────────────────────────────────────────────────────────────────
// RSS feed: description starts with "DD.MM.YYYY [bis DD.MM.YYYY] [von HH:MM bis HH:MM Uhr] [in LOCATION]: text"

function parseGermanDateDMY(dateStr: string): string {
  const m = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

function extractEvents(rssXml: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const items = rssXml.split(/<\/item>/).filter((b) => /<item>/.test(b));
  for (const item of items) {
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    if (!title) continue;

    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
    if (!linkMatch) continue;
    const url = (linkMatch[1] ?? "").trim();

    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);
    const desc = descMatch ? (descMatch[1] ?? "").trim() : "";

    const dateMatch = desc.match(/^(\d{2}\.\d{2}\.\d{4})/);
    const startDate = dateMatch ? parseGermanDateDMY(dateMatch[1]!) : now;

    // Extract location from "in LOCATION:" pattern
    const locMatch = desc.match(/ in ([^:]+?):/);
    const location = locMatch ? decodeHtmlEntities((locMatch[1] ?? "").trim()) : undefined;

    const fidMatch = url.match(/FID=[\d.]+/);
    const id = fidMatch ? `eisenhuettenstadt-event-${fidMatch[0].replace("FID=", "").replace(/\./g, "-")}` : url;

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

// ── News ──────────────────────────────────────────────────────────────────────
// RSS feed with <pubDate>Mon, 04 May 2026 14:34:44 +0200</pubDate>

const MONTH_ABBR: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseRfc822Date(dateStr: string): string {
  const m = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!m) return new Date().toISOString();
  const mm = MONTH_ABBR[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

function extractNews(rssXml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = rssXml.split(/<\/item>/).filter((b) => /<item>/.test(b));
  for (const block of blocks) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    if (!title) continue;

    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    if (!linkMatch) continue;
    const url = (linkMatch[1] ?? "").trim();

    const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubMatch ? parseRfc822Date((pubMatch[1] ?? "").trim()) : now;

    const fidMatch = url.match(/FID=([\d.]+)/);
    const id = fidMatch ? fidMatch[1]! : url;

    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch
      ? decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    items.push({
      id,
      title,
      url,
      ...(description ? { description } : {}),
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// HTML: <a href="/media/custom/2852_NNNN_1.PDF?TIMESTAMP">Amtsblatt YYYY/NN</a>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<a href="(\/media\/custom\/[^"]+\.PDF\?(\d+))"[^>]*>\s*Amtsblatt\s+(\d{4})\/(\d+)\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const ts = parseInt(m[2]!, 10);
    const year = m[3]!;
    const num = m[4]!.padStart(2, "0");
    const publishedAt = new Date(ts * 1000).toISOString().slice(0, 10) + "T00:00:00.000Z";
    items.push({
      id: `eisenhuettenstadt-amtsblatt-${year}-${num}`,
      title: `Amtsblatt ${year}/${num}`,
      url: `${BASE_URL}${href}`,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

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
    if (!byId.has(n.id)) {
      byId.set(n.id, n);
    } else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/media/rss/", "/Rathaus/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsRss, newsRss, amtsblattHtml] = await Promise.all([
  fetchLatin1(EVENTS_RSS_URL, headers),
  fetchLatin1(NEWS_RSS_URL, headers),
  fetchLatin1(AMTSBLATT_URL, headers).catch(() => ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsRss));
const mergedNews = mergeNews(existingNews.items, extractNews(newsRss));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
