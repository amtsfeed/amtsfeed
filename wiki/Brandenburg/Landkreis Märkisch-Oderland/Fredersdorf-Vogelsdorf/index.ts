#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.fredersdorf-vogelsdorf.de";
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
// PortUNA event-box variant (same as Amt Golzow)
// Container: <div class="event-box">
// Title: <span class="event-title"><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">TITLE</a>
// Date: from URL path
// Time: <span class="event-time"><time>HH:MM</time> Uhr</span>
// Location: <span class="event-ort">TEXT</span>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s+class="event-box")/).filter((b) => b.includes('class="event-box"'));

  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+href="([^"]*\/veranstaltungen\/[^"]+)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const datePathMatch = href.match(/\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (!datePathMatch) continue;
    const id = datePathMatch[1]!;
    const isoDate = `${datePathMatch[2]}-${datePathMatch[3]}-${datePathMatch[4]}`;

    const titleMatch = block.match(/<span\s+class="event-title">\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const timeMatch = block.match(/<span\s+class="event-time">([\s\S]*?)<\/span>/i);
    let startDate = `${isoDate}T00:00:00.000Z`;
    let endDate: string | undefined;
    if (timeMatch) {
      const times = [...(timeMatch[1] ?? "").matchAll(/<time>(\d{2}:\d{2})<\/time>/g)].map((m) => m[1]);
      if (times[0]) startDate = `${isoDate}T${times[0]}:00.000Z`;
      if (times[1]) endDate = `${isoDate}T${times[1]}:00.000Z`;
    }

    const locationMatch = block.match(/<span\s+class="event-ort">([\s\S]*?)<\/span>/i);
    const location = locationMatch
      ? decodeHtmlEntities((locationMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({
      id,
      title,
      url,
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
// PortUNA: <li class="news-entry-to-limit col-xs-12 col-sm-6">
// Title: <h4 class="title_news_19"><a href="/news/1/ID/nachrichten/slug.html">TITLE</a></h4>
// Date: <p class="vorschau_text">DD.MM.YYYY: TEXT</p>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li[^>]*class="[^"]*news-entry-to-limit)/).filter((b) =>
    b.includes("news-entry-to-limit")
  );

  for (const block of blocks) {
    const titleMatch = block.match(/<h[34][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const id = idMatch ? `fredersdorf-news-${idMatch[1]!}` : href;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const vorschauMatch = block.match(/<p[^>]*class="[^"]*vorschau[^"]*">([\s\S]*?)<\/p>/i);
    let publishedAt: string | undefined;
    if (vorschauMatch) {
      const text = decodeHtmlEntities((vorschauMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
      const dateMatch = text.match(/^(\d{1,2})\.(\d{2})\.(\d{4}):/);
      if (dateMatch) {
        publishedAt = `${dateMatch[3]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[1]!.padStart(2, "0")}T00:00:00.000Z`;
      }
    }

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

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
