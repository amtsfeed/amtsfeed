#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AmtsblattFile, AmtsblattItem, EventsFile, Event, NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.eichwalde.de";
const NEWS_API = `${BASE_URL}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc`;
const EVENTS_API = `${BASE_URL}/wp-json/tribe/events/v1/events?per_page=50&status=publish`;
const AMTSBLATT_URL = `${BASE_URL}/buergerservice/amtsblaetter/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtml(str: string): string {
  return str
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—")
    .replace(/&#8216;/g, "‘").replace(/&#8217;/g, "’")
    .replace(/&#8218;/g, "‚").replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”").replace(/&#038;/g, "&").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News via wp-json REST API ─────────────────────────────────────────────────

interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  excerpt?: { rendered: string };
}

function wpPostToNewsItem(p: WpPost): NewsItem {
  const now = new Date().toISOString();
  const title = decodeHtml(p.title.rendered.replace(/<[^>]+>/g, "").trim());
  const description = p.excerpt
    ? decodeHtml(p.excerpt.rendered.replace(/<[^>]+>/g, "").trim()).slice(0, 300) || undefined
    : undefined;
  return {
    id: `eichwalde-news-${p.id}`,
    title,
    url: p.link,
    publishedAt: p.date ? new Date(p.date).toISOString() : now,
    fetchedAt: now,
    updatedAt: now,
    ...(description ? { description } : {}),
  };
}

// ── Events via The Events Calendar tribe/events/v1 API ───────────────────────

interface TribeEvent {
  id: number;
  start_date: string;
  end_date?: string;
  url: string;
  title: string;
  description?: string;
}

function tribeEventToEvent(e: TribeEvent): Event {
  const now = new Date().toISOString();
  return {
    id: `eichwalde-event-${e.id}`,
    title: decodeHtml(e.title.replace(/<[^>]+>/g, "").trim()),
    url: e.url,
    startDate: new Date(e.start_date).toISOString(),
    ...(e.end_date ? { endDate: new Date(e.end_date).toISOString() } : {}),
    fetchedAt: now,
    updatedAt: now,
  };
}

// ── Amtsblatt via HTML page ───────────────────────────────────────────────────
// The link text is in <span class="kt-svg-icon-list-text">Amtsblatt YYYY NN (DD.MM.YYYY)</span>
// which appears after the <a href="...pdf"> tag (within ~800 chars).

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const linkRx = /<a\s+href="(https:\/\/www\.eichwalde\.de\/wp-content\/uploads\/[^"]+Amtsblatt[^"]+\.pdf)"\s/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRx.exec(html)) !== null) {
    const url = m[1]!;
    // Look for kt-svg-icon-list-text span within 800 chars after the href
    const chunk = html.slice(m.index, m.index + 800);
    const textMatch = chunk.match(/kt-svg-icon-list-text[^>]*>Amtsblatt\s+(\d{4})\s+(\d{1,2})\s+\((\d{1,2})\.(\d{2})\.(\d{4})\)<\/span>/i);
    if (!textMatch) continue;
    const year = textMatch[1]!;
    const num = textMatch[2]!.padStart(2, "0");
    const day = textMatch[3]!.padStart(2, "0");
    const month = textMatch[4]!;
    const pubYear = textMatch[5]!;
    const id = `eichwalde-amtsblatt-${pubYear}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url,
      publishedAt: `${pubYear}-${month}-${day}T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
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
assertAllowed(robots, ["/wp-json/", "/buergerservice/"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Paginate wp-json news: up to 3 pages
async function fetchAllNews(): Promise<WpPost[]> {
  const posts: WpPost[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `${NEWS_API}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const batch = (await res.json()) as WpPost[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    posts.push(...batch);
    if (batch.length < 50) break;
  }
  return posts;
}

// Paginate tribe events: up to 3 pages
async function fetchAllEvents(): Promise<TribeEvent[]> {
  const events: TribeEvent[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `${EVENTS_API}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = (await res.json()) as { events?: TribeEvent[]; total?: number };
    const batch = data.events ?? [];
    if (batch.length === 0) break;
    events.push(...batch);
    if (batch.length < 50) break;
  }
  return events;
}

const [wpPosts, tribeEvents, amtsblattHtml] = await Promise.all([
  fetchAllNews(),
  fetchAllEvents(),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, wpPosts.map(wpPostToNewsItem));
const mergedEvents = mergeEvents(existingEvents.items, tribeEvents.map(tribeEventToEvent));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
if (mergedEvents.length > 0)
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
if (mergedAmtsblatt.length > 0)
  writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
