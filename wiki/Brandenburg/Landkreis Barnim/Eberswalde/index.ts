#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.eberswalde.de";
const EVENTS_URL = `${BASE_URL}/termine`;
const NEWS_URL = `${BASE_URL}/aktuelles`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];
  const seen = new Set<string>();

  const blocks = html.split('<article class="event">');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;

    // URL from <h3 class="event__title"><a href="...">
    const urlMatch = block.match(/<h3\s+class="event__title">\s*<a\s+href="([^"]+)"/);
    if (!urlMatch) continue;
    const url = urlMatch[1]!;

    // ID: last path segment of URL
    const id = url.split("/").pop() ?? url;

    // Title: text inside <a>
    const titleMatch = block.match(/<h3\s+class="event__title">\s*<a\s+[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());

    // Start date: <span class="startdate">Weekday, DD.MM.YYYY</span>
    const startDateMatch = block.match(/<span\s+class="startdate">[^,]+,\s+(\d{2})\.(\d{2})\.(\d{4})<\/span>/);
    if (!startDateMatch) continue;
    const startDatePart = `${startDateMatch[3]}-${startDateMatch[2]}-${startDateMatch[1]}`;

    // End date: <span class="enddate">Weekday, DD.MM.YYYY</span> (optional)
    const endDateMatch = block.match(/<span\s+class="enddate">[^,]+,\s+(\d{2})\.(\d{2})\.(\d{4})<\/span>/);
    const endDate = endDateMatch ? `${endDateMatch[3]}-${endDateMatch[2]}-${endDateMatch[1]}T00:00:00.000Z` : undefined;

    // Start time: <span class="starttime">HH:MM Uhr</span> (optional)
    const timeMatch = block.match(/<span\s+class="starttime">(\d{2}:\d{2})\s+Uhr<\/span>/);
    const startDate = timeMatch
      ? `${startDatePart}T${timeMatch[1]}:00.000Z`
      : `${startDatePart}T00:00:00.000Z`;

    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      title,
      url,
      startDate,
      ...(endDate ? { endDate } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// ── News ──────────────────────────────────────────────────────────────────────

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  const blocks = html.split('<article class="news-article news-article--list">');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;

    // URL from <a href="https://www.eberswalde.de/aktuelles/..." class="btn btn-primary">
    const urlMatch = block.match(/<a\s+href="(https:\/\/www\.eberswalde\.de\/aktuelles\/[^"]+)"\s+class="btn btn-primary">/);
    if (!urlMatch) continue;
    const url = urlMatch[1]!;

    // ID: last path segment
    const id = url.split("/").pop() ?? url;

    // Title from <h3 class="news-article__title">...</h3>
    const titleMatch = block.match(/<h3\s+class="news-article__title">([^<]+)<\/h3>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());

    // Date from <span class="date">Weekday, DD.MM.YYYY</span>
    const dateMatch = block.match(/<span\s+class="date">[^,]+,\s+(\d{2})\.(\d{2})\.(\d{4})<\/span>/);
    let publishedAt: string | undefined;
    if (dateMatch) {
      publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    }

    if (seen.has(id)) continue;
    seen.add(id);

    news.push({
      id,
      title,
      url,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return news.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return 0;
  });
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
assertAllowed(robots, ["/termine", "/aktuelles"]);

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
