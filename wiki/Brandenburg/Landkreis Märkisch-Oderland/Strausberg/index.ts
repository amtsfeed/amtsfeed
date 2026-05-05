#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.stadt-strausberg.de";
const EVENTS_BASE = `${BASE_URL}/veranstaltungen`;
const DIR = dirname(fileURLToPath(import.meta.url));

const DE_MONTHS = [
  "januar", "februar", "marz", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "dezember",
];

function monthUrl(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${EVENTS_BASE}/${year}-${mm}-01/${DE_MONTHS[month - 1]}-${year}/`;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#038;/g, "&")
    .replace(/&#8203;/g, "").replace(/&#8230;/g, "…").replace(/&#8222;/g, "„")
    .replace(/&auml;/g, "ä").replace(/&Auml;/g, "Ä").replace(/&ouml;/g, "ö").replace(/&Ouml;/g, "Ö")
    .replace(/&uuml;/g, "ü").replace(/&Uuml;/g, "Ü").replace(/&szlig;/g, "ß").replace(/&eacute;/g, "é")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Source: stadt-strausberg.de/veranstaltungen/YYYY-MM-01/monthname-YYYY/
// WordPress site with custom rb_events post type.
//
// Container: <article class="rb-event-item rb-event-item-id-{ID}-{YYYY-MM-DD} rb-event-item_cat_*">
// Anchor: <a id="veranstaltungen-{ID}-{YYYY-MM-DD}">
// Title: <h3>TITLE</h3>
// Date: <time datetime="YYYY-MM-DD">
// Location: <address class="rb-event-item-location">TEXT</address>
// URL: {EVENTS_BASE}/YYYY-MM-01/monthname-YYYY/#veranstaltungen-{ID}-{YYYY-MM-DD}
// Recurring events: same ID, different dates → composite ID {ID}-{YYYY-MM-DD}

function extractEvents(html: string, pageUrl: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];

  const articleRx = /<article\s+class="rb-event-item\s+rb-event-item-id-(\d+)-(\d{4}-\d{2}-\d{2})[^"]*"([\s\S]*?)<\/article>/g;
  let m: RegExpExecArray | null;

  while ((m = articleRx.exec(html)) !== null) {
    const eventId = m[1]!;
    const dateStr = m[2]!;
    const body = m[3]!;

    const titleMatch = body.match(/<h3>([\s\S]*?)<\/h3>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const locationMatch = body.match(/<address[^>]*class="rb-event-item-location"[^>]*>([\s\S]*?)<\/address>/);
    const location = locationMatch
      ? decodeHtmlEntities(locationMatch[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : undefined;

    const id = `strausberg-${eventId}-${dateStr.replace(/-/g, "")}`;
    const anchor = `veranstaltungen-${eventId}-${dateStr}`;
    const url = `${pageUrl}#${anchor}`;

    events.push({
      id,
      title,
      url,
      startDate: `${dateStr}T00:00:00.000Z`,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// News feed at /aktuelles/feed/ is disallowed by robots.txt (*/feed/).
// Individual article URLs redirect to /aktuelles/#post-{ID}.
// Strategy:
//   1. Fetch rb_news-sitemap.xml → list of (url, lastmod), take 20 most recent
//   2. HEAD each URL to follow redirect → extract post ID from Location: /aktuelles/#post-{ID}
//   3. Fetch /aktuelles/ HTML → build {postID: title} map
//   4. Combine into NewsItem[]

const NEWS_SITEMAP_URL = `${BASE_URL}/rb_news-sitemap.xml`;
const NEWS_HTML_URL = `${BASE_URL}/aktuelles/`;
const NEWS_LIMIT = 20;

function parseSitemapUrls(xml: string): Array<{ url: string; lastmod: string }> {
  const items: Array<{ url: string; lastmod: string }> = [];
  const blockRx = /<url>([\s\S]*?)<\/url>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRx.exec(xml)) !== null) {
    const block = m[1]!;
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (!locMatch) continue;
    const url = locMatch[1]!.trim();
    const lastmod = lastmodMatch?.[1]?.trim() ?? "";
    if (url !== `${BASE_URL}/aktuelles/`) items.push({ url, lastmod });
  }
  return items;
}

function extractNewsTitles(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const rx = /<div[^>]*class="rb-news-item rb-news-item-id(\d+)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const postId = m[1]!;
    const title = decodeHtmlEntities(m[2]!.replace(/<[^>]+>/g, "").trim());
    if (title) map.set(postId, title);
  }
  return map;
}

async function fetchRecentNews(hdrs: Record<string, string>): Promise<NewsItem[]> {
  const now = new Date().toISOString();

  const [sitemapXml, newsHtml] = await Promise.all([
    fetch(NEWS_SITEMAP_URL, { headers: hdrs }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_SITEMAP_URL}`); return r.text(); }),
    fetch(NEWS_HTML_URL, { headers: hdrs }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_HTML_URL}`); return r.text(); }),
  ]);

  const allSitemapItems = parseSitemapUrls(sitemapXml);
  // Sort by lastmod descending, take most recent
  allSitemapItems.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
  const recent = allSitemapItems.slice(0, NEWS_LIMIT);

  const titleMap = extractNewsTitles(newsHtml);

  // HEAD each URL to get post ID from redirect Location header
  const resolved = await Promise.all(
    recent.map(async ({ url, lastmod }) => {
      try {
        const res = await fetch(url, { headers: hdrs, redirect: "manual" });
        const location = res.headers.get("location") ?? "";
        const postIdMatch = location.match(/#post-(\d+)$/);
        if (!postIdMatch) return null;
        const postId = postIdMatch[1]!;
        const title = titleMap.get(postId);
        if (!title) return null;
        const publishedAt = lastmod ? new Date(lastmod).toISOString() : undefined;
        return { id: `strausberg-news-${postId}`, title, url, publishedAt, fetchedAt: now, updatedAt: now };
      } catch {
        return null;
      }
    })
  );

  return resolved.filter((n): n is NewsItem => n !== null);
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
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
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return 0;
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/", "/aktuelles/", "/rb_news-sitemap.xml"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Current month + next 2 months
const now = new Date();
const monthFetches: Array<{ url: string; promise: Promise<string> }> = [];
for (let i = 0; i < 3; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
  const url = monthUrl(d.getFullYear(), d.getMonth() + 1);
  monthFetches.push({
    url,
    promise: fetch(url, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); }),
  });
}

const [incomingNews, ...monthResults] = await Promise.all([
  fetchRecentNews(headers),
  ...monthFetches.map((f) => f.promise),
]);

const allIncomingEvents: Map<string, Event> = new Map();
for (let i = 0; i < monthFetches.length; i++) {
  const pageUrl = monthFetches[i]!.url;
  for (const e of extractEvents(monthResults[i]!, pageUrl)) {
    if (!allIncomingEvents.has(e.id)) allIncomingEvents.set(e.id, e);
  }
}

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, [...allIncomingEvents.values()]);
const mergedNews = mergeNews(existingNews.items, incomingNews);

const nowIso = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: nowIso, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: nowIso, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
