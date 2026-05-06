#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.kremmen.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA events-entry-3: <div class="row events-entry-3">
//   <time class="events-entry-3-time" datetime="YYYY-MM-DD">
//   <h2 class="legacy_h5 events-entry-3-headline"><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s[^>]*class="row events-entry-3")/)
    .filter((b) => /class="row events-entry-3"/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;

    const titleMatch = block.match(/<h[2-6][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const startDate = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : now;

    const locMatch = block.match(/<p[^>]*class="events-entry-3-location"[^>]*>([\s\S]*?)<\/p>/i);
    const location = locMatch
      ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    const idMatch = href.match(/\/veranstaltungen\/(\d+)\//);
    const id = idMatch ? `kremmen-event-${idMatch[1]!}` : href;

    events.push({ id, title, url: `${BASE_URL}${href}`, startDate, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── News ──────────────────────────────────────────────────────────────────────
// PortUNA news archive: <h2 class='legacy_h5'>DD.MM.YYYY</h2>
//   <ul><li><a href="/news/N/ID/cat/slug.html">Title</a></li></ul>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Strip zero-width spaces before matching (PortUNA uses &#8203; between digits)
  const src = html.replace(/&#8203;/g, "");
  const dateRx = /<h[2-6][^>]*>(\d{2})\.(\d{2})\.(\d{4})<\/h[2-6]>([\s\S]*?)(?=<h[2-6]|$)/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dateRx.exec(src)) !== null) {
    const publishedAt = `${dm[3]}-${dm[2]}-${dm[1]}T00:00:00.000Z`;
    const block = dm[4] ?? "";

    const linkRx = /<a\s+href="(\/news\/\d+\/(\d+)\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRx.exec(block)) !== null) {
      const href = lm[1]!;
      const newsId = lm[2]!;
      const id = `kremmen-news-${newsId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const title = decodeHtmlEntities((lm[3] ?? "").replace(/<[^>]+>/g, "").trim());
      if (!title) continue;
      items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now, updatedAt: now });
    }
  }

  return items.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/", "/news/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
