#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://britz-chorin-oderberg.de";
const EVENTS_URL = `${BASE_URL}/events`;
const NEWS_URL = `${BASE_URL}/thema/news`;
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
// Container: <article class="event card" id="event-ID">
// DateTime: <time class="event__date" datetime="ISO">
// Title: class="event__title" → strip <a> tags
// Location: <p class="event__location">TEXT</p>
// URL: BASE_URL/events#event-ID

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split('<article class="event card" id="event-').slice(1);

  for (const block of blocks) {
    const idMatch = block.match(/^(\d+)"/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    const datetimeMatch = block.match(/<time class="event__date"[^>]*datetime="([^"]+)"/);
    if (!datetimeMatch) continue;
    const startDate = new Date(datetimeMatch[1]!).toISOString();

    const titleMatch = block.match(/class="[^"]*event__title[^"]*"[^>]*>([\s\S]*?)<\/(?:h[23456]|span|div)>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const locationMatch = block.match(/<p class="event__location">([^<]+)<\/p>/);
    const location = locationMatch ? decodeHtmlEntities(locationMatch[1]!.trim()) : undefined;

    const url = `${BASE_URL}/events#event-${id}`;

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
// HTML page: <a class="teaser__link" href="URL"><h2 class="teaser__title">
//   <span class="teaser__topic">TOPIC</span>...: TITLE</h2></a>
// Date: <time class="teaser__date" datetime="ISO">
// ID: last path segment of URL

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  // Split on teaser links
  const blocks = html.split('<a class="teaser__link"').slice(1);

  for (const block of blocks) {
    const linkMatch = block.match(/href="([^"]+)"/);
    if (!linkMatch) continue;
    const url = linkMatch[1]!;

    // Get title from h2.teaser__title, stripping inner spans (topic)
    const titleBlockMatch = block.match(/<h2 class="teaser__title">([\s\S]*?)<\/h2>/);
    if (!titleBlockMatch) continue;
    // Remove screen-reader-only spans and topic spans, keep remaining text
    const rawTitle = (titleBlockMatch[1] ?? "")
      .replace(/<span class="teaser__topic">[^<]*<\/span>/g, "")
      .replace(/<span class="screen-reader-only">[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^\s*[:–-]\s*/, "")
      .trim();
    const title = decodeHtmlEntities(rawTitle);
    if (!title) continue;

    const datetimeMatch = block.match(/<time class="teaser__date"[^>]*datetime="([^"]+)"/);
    const publishedAt = datetimeMatch ? new Date(datetimeMatch[1]!).toISOString() : undefined;

    // ID from last path segment
    const slugMatch = url.match(/\/([^/]+)\/?$/);
    const id = slugMatch ? slugMatch[1]! : url;

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
assertAllowed(robots, ["/events", "/thema/news"]);

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
