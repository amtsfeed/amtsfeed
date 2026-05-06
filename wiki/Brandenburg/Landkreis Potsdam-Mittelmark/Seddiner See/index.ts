#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.seddiner-see.de";
const NEWS_URL = `${BASE_URL}/`;
const AMTSBLATT_URL = `${BASE_URL}/gemeinde/amtsblatt`;
const EVENTS_API = `${BASE_URL}/api/calendar/event?filter%5Bcategory%5D=2&filter%5Breadonly%5D=true&filter%5Border%5D=start+asc&filter%5Bnolimit%5D=true`;
const EVENTS_URL = `${BASE_URL}/calendar/category?id=2`;
const DIR = dirname(fileURLToPath(import.meta.url));

interface ListingItem { id: number; title: string; link: string; created_on: number; }
interface ListingCategory { title: string; items: ListingItem[]; }
interface ListingData { list: { categories: ListingCategory[] }; }

function extractListingJson(html: string, varName = "listing_1"): ListingData | null {
  const m = html.match(new RegExp(`var \\$${varName} = (\\{[\\s\\S]*?\\});(?=\\s*(?:var|<))`));
  if (!m) return null;
  try { return JSON.parse(m[1]!) as ListingData; } catch { return null; }
}

function extractNews(html: string): NewsItem[] {
  const data = extractListingJson(html);
  if (!data) return [];
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  for (const cat of data.list.categories) {
    for (const item of cat.items) {
      const title = item.title.trim();
      if (!title) continue;
      const url = item.link.startsWith("http") ? item.link : `${BASE_URL}/${item.link}`;
      const publishedAt = new Date(item.created_on * 1000).toISOString();
      items.push({ id: `seddiner-see-news-${item.id}`, title, url, fetchedAt: now, publishedAt, updatedAt: now });
    }
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const data = extractListingJson(html);
  if (!data) return [];
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  for (const cat of data.list.categories) {
    for (const item of cat.items) {
      // Title format: "DD.MM.YYYY - Description"
      const dateMatch = item.title.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(.+)$/);
      if (!dateMatch) continue;
      const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
      const title = dateMatch[4]!.trim();
      const url = item.link.startsWith("http") ? item.link : `${BASE_URL}/${item.link}`;
      items.push({ id: `seddiner-see-bekanntmachung-${item.id}`, title, url, publishedAt, fetchedAt: now });
    }
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

interface CalendarEvent { id: number; title: string; start: string; end?: string; description?: string; }
interface CalendarResponse { events: CalendarEvent[]; count: number; }

function extractEvents(data: CalendarResponse): Event[] {
  const now = new Date().toISOString();
  return data.events
    .map((e) => ({
      id: `seddiner-see-event-${e.id}`,
      title: e.title.trim(),
      url: EVENTS_URL,
      startDate: e.start,
      ...(e.end ? { endDate: e.end } : {}),
      fetchedAt: now,
      updatedAt: now,
    }))
    .filter((e) => e.title)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/", "/gemeinde/", "/api/calendar/", "/calendar/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml, eventsJson] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(EVENTS_API, { headers }).then((r) => r.ok ? r.json() as Promise<CalendarResponse> : Promise.resolve({ events: [], count: 0 })),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsJson));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
