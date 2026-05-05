#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.oderbruch-tourismus.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// CMS variant: <div class="event-entry-new-2"> blocks.
// Date: <time datetime="YYYY-MM-DD"> inside event-entry-new-2-time
// Optional time: <time>HH:MM</time> inside event-entry-new-2-daytime (start + optional end)

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s+class="event-entry-new-2">)/)
    .filter((b) => b.includes('class="event-entry-new-2"'));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;

    const titleMatch = block.match(/class="event-entry-new-2-headline"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/<time\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    if (!dateMatch) continue;
    const baseDate = `${dateMatch[1]}T00:00:00.000Z`;

    // Optional start/end times from daytime block
    const daytimeMatch = block.match(/class="event-entry-new-2-daytime"[^>]*>([\s\S]*?)<\/div>/i);
    const times = daytimeMatch
      ? [...(daytimeMatch[1] ?? "").matchAll(/<time>(\d{2}:\d{2})<\/time>/g)].map((m) => m[1])
      : [];
    const startDate = times[0]
      ? baseDate.replace("T00:00:00.000Z", `T${times[0]}:00.000Z`)
      : baseDate;
    const endDate = times[1]
      ? baseDate.replace("T00:00:00.000Z", `T${times[1]}:00.000Z`)
      : undefined;

    const locMatch = block.match(/class="event-entry-new-2-location"[^>]*>([\s\S]*?)<\/div>/i);
    const location = locMatch
      ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({
      id: href.replace(/^\//, "").replace(/\//g, "-"),
      title,
      url: `${BASE_URL}${href}`,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// news-entry-to-limit items; no publication date on listing page.
// Title: <h3 class="legacy_h4 title_news_19"><a href="...">TITLE</a></h3>
// Description: <p class="vorschau_text">TEXT [<a>mehr</a>]</p>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=class="news-entry-to-limit)/)
    .filter((b) => /class="news-entry-to-limit/.test(b));

  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const href = titleMatch[1]!;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const teaserMatch = block.match(/class="vorschau_text"[^>]*>([\s\S]*?)<\/p>/i);
    const description = teaserMatch
      ? decodeHtmlEntities((teaserMatch[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s*\[mehr\]\s*$/i, "").trim())
      : undefined;

    const idMatch = href.match(/\/news\/\d+\/(\d+)\//);
    const id = idMatch ? idMatch[1]! : href;

    items.push({
      id,
      title,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      ...(description ? { description } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items;
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
    if (!byId.has(n.id)) {
      byId.set(n.id, n);
    } else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

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
