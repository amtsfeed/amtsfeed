#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.elsterwerda.de";
const NEWS_API = `${BASE_URL}/wp-json/wp/v2/posts?per_page=50&_fields=id,date,title,link,excerpt`;
const EVENTS_API = `${BASE_URL}/wp-json/tribe/events/v1/events?per_page=50`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").trim();
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
assertAllowed(robots, ["/wp-json/wp/v2/posts"]);

const headers = { "User-Agent": AMTSFEED_UA };
const now = new Date().toISOString();

const [postsRaw, eventsRaw] = await Promise.all([
  fetch(NEWS_API, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_API}`); return r.json() as Promise<Record<string, unknown>[]>; }),
  fetch(EVENTS_API, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_API}`); return r.json() as Promise<{ events?: Record<string, unknown>[] }>; }),
]);

const newsItems: NewsItem[] = postsRaw.map((p) => ({
  id: String(p["id"]),
  title: decodeHtmlEntities(stripHtml((p["title"] as { rendered?: string })?.rendered ?? "")),
  url: String(p["link"] ?? ""),
  publishedAt: p["date"] ? `${String(p["date"]).replace(" ", "T")}.000Z` : null,
  fetchedAt: now,
  updatedAt: now,
})).filter((n) => n.title && n.url);

const eventItems: Event[] = ((eventsRaw as { events?: Record<string, unknown>[] })?.events ?? []).map((e) => {
  const startRaw = String(e["start_date"] ?? "");
  const startDate = startRaw ? startRaw.replace(" ", "T") + ".000Z" : "";
  return {
    id: String(e["id"]),
    title: decodeHtmlEntities(stripHtml(String(e["title"] ?? ""))),
    url: String(e["url"] ?? ""),
    startDate,
    fetchedAt: now,
    updatedAt: now,
  };
}).filter((e) => e.title && e.url && e.startDate);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, eventItems);
const mergedNews = mergeNews(existingNews.items, newsItems);

writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
