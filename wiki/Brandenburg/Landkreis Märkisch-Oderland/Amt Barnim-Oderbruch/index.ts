#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.barnim-oderbruch.de";
const EVENTS_URL = `${BASE_URL}/aktuelles/veranstaltungen`;
const NEWS_URL = `${BASE_URL}/aktuelles`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Shared parser for TYPO3 EXT:news items ───────────────────────────────────
// Container: <div class="post-item article ...">
// Date: <time itemprop="datePublished" datetime="YYYY-MM-DD">
// Title: <span itemprop="headline">TITLE</span>
// URL: <a itemprop="url" href="URL">
// ID: last slug segment of URL

function parseItems(html: string): Array<{ id: string; title: string; url: string; date?: string; description?: string }> {
  const result = [];

  const blocks = html.split(/(?=<div\s+class="post-item\s+article)/)
    .filter((b) => b.includes('class="post-item article'));

  for (const block of blocks) {
    const urlMatch = block.match(/itemprop="url"[^>]*href="([^"]+)"/);
    if (!urlMatch) continue;
    const href = urlMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleMatch = block.match(/itemprop="headline">([^<]+)</);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const dateMatch = block.match(/itemprop="datePublished"\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    const date = dateMatch ? dateMatch[1]! : undefined;

    const descMatch = block.match(/itemprop="description">([\s\S]*?)<\/div>/i);
    const description = descMatch
      ? decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    // ID from slug: last segment of path
    const id = href.split("/").filter(Boolean).pop() ?? href;

    result.push({ id, title, url, date, description });
  }
  return result;
}

// ── Events ────────────────────────────────────────────────────────────────────

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  return parseItems(html).map(({ id, title, url, date, description }) => ({
    id,
    title,
    url,
    startDate: date ? `${date}T00:00:00.000Z` : now,
    ...(description ? { description } : {}),
    fetchedAt: now,
    updatedAt: now,
  }));
}

// ── News ──────────────────────────────────────────────────────────────────────

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  return parseItems(html)
    .filter((item) => item.url.includes("/aktuelles/detail/"))
    .map(({ id, title, url, date, description }) => ({
      id,
      title,
      url,
      ...(description ? { description } : {}),
      fetchedAt: now,
      ...(date ? { publishedAt: `${date}T00:00:00.000Z` } : {}),
      updatedAt: now,
    }));
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
  // Sort by publishedAt desc, then by id (slug) desc for undated items
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return b.id.localeCompare(a.id);
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/aktuelles/veranstaltungen", "/aktuelles"]);

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
