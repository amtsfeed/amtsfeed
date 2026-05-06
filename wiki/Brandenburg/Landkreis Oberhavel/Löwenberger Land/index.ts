#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.loewenberger-land.de";
const NEWS_RSS_URL = `${BASE_URL}/news/rss.xml`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
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

// ── News ──────────────────────────────────────────────────────────────────────
// PortUNA RSS feed at /news/rss.xml

function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const block of xml.split("<item>").slice(1)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch || !linkMatch) continue;
    const url = linkMatch[1]!.trim();
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    if (!title || !url) continue;

    const idMatch = url.match(/\/news\/\d+\/(\d+)\//);
    const id = idMatch ? `loewenberger-land-news-${idMatch[1]!}` : url;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubDateMatch) {
      try { publishedAt = new Date(pubDateMatch[1]!.trim()).toISOString(); } catch { /* ignore */ }
    }

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA events-entry-3 format

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
    const id = idMatch ? `loewenberger-land-event-${idMatch[1]!}` : href;

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
assertAllowed(robots, ["/news/", "/veranstaltungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [rssXml, eventsHtml] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(rssXml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
if (mergedEvents.length > 0)
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
