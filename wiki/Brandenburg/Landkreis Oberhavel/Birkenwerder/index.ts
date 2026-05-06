#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.birkenwerder.de";
const NEWS_URL = `${BASE_URL}/rathaus/aktuelles/neuigkeiten`;
const EVENTS_URL = `${BASE_URL}/rathaus/aktuelles/termine/veranstaltungen`;
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

// TYPO3 news-list-view:
// <div class="article articletype-0 ...">
//   <a class="article-link" href="/rathaus/aktuelles/neuigkeiten/details/[slug]">
//     <time itemprop="datePublished" datetime="YYYY-MM-DD"></time>
//     <span itemprop="headline">Title</span>
//   </a>
// </div>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s[^>]*class="article\s)/).filter((b) => /\/neuigkeiten\/details\//.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/rathaus\/aktuelles\/neuigkeiten\/details\/([^"]+))"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!;
    const id = `birkenwerder-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/itemprop="headline">([\s\S]*?)<\/span>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").trim());
    if (!title) continue;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : undefined;

    items.push({ id, title, url: `${BASE_URL}${href}`, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// Events share same article structure with /veranstaltungen/details/ href
// and <time class="event-time-end" datetime="YYYY-MM-DD">

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s[^>]*class="article\s)/).filter((b) => /\/veranstaltungen\/details\//.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/rathaus\/aktuelles\/termine\/veranstaltungen\/details\/([^"]+))"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!;
    const id = `birkenwerder-event-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/itemprop="headline">([\s\S]*?)<\/span>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").trim());
    if (!title) continue;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const startDate = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : now;

    const locMatch = block.match(/Ort:\s*<\/span>([\s\S]*?)<\/li>/i);
    const location = locMatch ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) : undefined;

    events.push({ id, title, url: `${BASE_URL}${href}`, startDate, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
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
assertAllowed(robots, ["/rathaus/aktuelles/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
if (mergedEvents.length > 0)
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events: ${mergedEvents.length} Einträge`);
