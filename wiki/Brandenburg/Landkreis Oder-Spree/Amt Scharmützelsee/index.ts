#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-scharmuetzelsee.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA event-entry-new-2 variant
// Container: <div class="event-entry-new-2">
// Title: <h5><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">TITLE</a></h5>
// Date: <time datetime="YYYY-MM-DD"> in event-entry-new-2-time
// Time: <time>HH:MM</time> in event-entry-new-2-daytime
// Location: <div class="event-entry-new-2-location">TEXT</div>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div[^>]*class="event-entry-new-2">)/).filter((b) =>
    b.includes("event-entry-new-2-headline")
  );

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/([^"]+))"/);
    if (!linkMatch) continue;

    const href = linkMatch[1]!;
    const eventNum = linkMatch[2]!;
    const isoDate = `${linkMatch[3]}-${linkMatch[4]}-${linkMatch[5]}`;
    const slug = linkMatch[6]!.replace(/\.html$/, "");
    const id = `${eventNum}-${isoDate}-${slug}`.slice(0, 80);
    const url = `${BASE_URL}${href}`;

    if (seen.has(url)) continue;
    seen.add(url);

    const titleMatch = block.match(/<h[2-6][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Time from daytime block: <time>HH:MM</time>
    const daytimeMatch = block.match(/event-entry-new-2-daytime"[^>]*>([\s\S]*?)<\/div>/i);
    let startDate = `${isoDate}T00:00:00.000Z`;
    if (daytimeMatch) {
      const timeMatches = [...daytimeMatch[1]!.matchAll(/<time>(\d{1,2}:\d{2})<\/time>/g)].map((m) => m[1]);
      if (timeMatches[0]) startDate = `${isoDate}T${timeMatches[0]!.padStart(5, "0")}:00.000Z`;
    }

    const locationMatch = block.match(/event-entry-new-2-location">([\s\S]*?)<\/div>/i);
    const location = locationMatch
      ? decodeHtmlEntities(locationMatch[1]!.replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({ id, title, url, startDate, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// PortUNA news-entry-to-limit / events-entry-3 variant
// Container: <li class="news-entry-to-limit row events-entry-3">
// Date: <time class="events-entry-3-time" datetime="YYYY-MM-DD">
// Title: <h3 class="... events-entry-3-headline"><a href="/news/1/ID/nachrichten/slug.html">TITLE</a></h3>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*class="[^"]*news-entry-to-limit)/).filter((b) =>
    b.includes("news-entry-to-limit")
  );

  for (const block of blocks) {
    const dateMatch = block.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/);
    const titleMatch = block.match(/<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = decodeHtmlEntities(titleMatch[2]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const id = idMatch ? `scharmuetzelsee-amt-news-${idMatch[1]!}` : href;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : undefined;

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

const NEWS_LIMIT = 20;

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
assertAllowed(robots, ["/veranstaltungen/index.php", "/news/1"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });

// Replace old tourism events with fresh municipality events
const freshEvents = extractEvents(eventsHtml);
const mergedEvents = mergeEvents([], freshEvents);
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
