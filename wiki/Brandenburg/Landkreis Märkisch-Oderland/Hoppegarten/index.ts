#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.gemeinde-hoppegarten.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/`;
const NEWS_URL = `${BASE_URL}/news/1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
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
// PortUNA event-entry-new-1 variant
// Container: <div class="... event-entry-new-1">
// Title: <h2><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">TITLE</a></h2>
// Date: from URL path (time elements have datetime="1970-01-01" bug)
// Time: <time>HH:MM</time> in event-entry-new-1-daytime
// Location: <div class="event-entry-new-1-location">TEXT</div>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Outer container has class ending in "event-entry-new-1" (not "event-entry-new-1-content" etc.)
  const blocks = html.split(/(?=<div[^>]*class="[^"]*event-entry-new-1")/).filter((b) =>
    b.includes("event-entry-new-1-content")
  );

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"/);
    if (!linkMatch) continue;

    const href = linkMatch[1]!;
    const id = linkMatch[2]!;
    const isoDate = `${linkMatch[3]}-${linkMatch[4]}-${linkMatch[5]}`;
    const url = `${BASE_URL}${href}`;

    if (seen.has(url)) continue;
    seen.add(url);

    const titleMatch = block.match(/<h[23][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Time from daytime block: <time>HH:MM</time>
    const daytimeMatch = block.match(/event-entry-new-1-daytime">([\s\S]*?)<\/div>/i);
    let startDate = `${isoDate}T00:00:00.000Z`;
    if (daytimeMatch) {
      const timeMatches = [...daytimeMatch[1]!.matchAll(/<time>(\d{1,2}:\d{2})<\/time>/g)].map((m) => m[1]);
      if (timeMatches[0]) startDate = `${isoDate}T${timeMatches[0]!.padStart(5, "0")}:00.000Z`;
    }

    const locationMatch = block.match(/event-entry-new-1-location">([\s\S]*?)<\/div>/i);
    const location = locationMatch
      ? decodeHtmlEntities(locationMatch[1]!.replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({ id, title, url, startDate, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// PortUNA events-entry-3 style news listing
// Container: <li class="news-entry-to-limit row events-entry-3">
// Date: <time class="events-entry-3-time" datetime="YYYY-MM-DD">
// Title: <h3 class="... events-entry-3-headline"><a href="/news/1/{ID}/nachrichten/{slug}.html">TITLE</a></h3>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*class="[^"]*news-entry-to-limit)/).filter((b) =>
    b.includes("news-entry-to-limit")
  );

  for (const block of blocks) {
    const dateMatch = block.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/);
    const titleMatch = block.match(/<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = decodeHtmlEntities(titleMatch[2]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const id = idMatch ? `hoppegarten-news-${idMatch[1]!}` : href;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : undefined;

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────

function extractAmtsblatt(html: string, listingUrl: string, idPrefix: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>Nr\.\s*(\d+)\/(\d{4})<\/td>\s*<td>([\d.&#;]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[1]!.padStart(2, "0");
    const year = m[2]!;
    const dateStr = m[3]!.replace(/&#\d+;/g, "");
    const dateParts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    items.push({
      id: `${idPrefix}-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: listingUrl,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

const NEWS_LIMIT = 50;

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
  return [...byId.values()]
    .sort((a, b) => {
      if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
      return 0;
    })
    .slice(0, NEWS_LIMIT);
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/", "/news/1", "/amtsblatt/index.php"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml, AMTSBLATT_URL, "hoppegarten"));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
