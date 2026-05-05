#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.wriezen.de";
const EVENTS_BASE = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&ensp;/g, " ").replace(/&copy;/g, "©").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&auml;/g, "ä").replace(/&Auml;/g, "Ä").replace(/&ouml;/g, "ö").replace(/&Ouml;/g, "Ö")
    .replace(/&uuml;/g, "ü").replace(/&Uuml;/g, "Ü").replace(/&szlig;/g, "ß").replace(/&eacute;/g, "é")
    .replace(/&#8203;/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Source: wriezen.de/veranstaltungen/index.php?month=YYYY-MM (PortUNA event-clndr-3)
// Events are stored in data-events attributes on calendar day cells.
// Each data-events value is an HTML-encoded string containing event-clndr-3-entry blocks.
//
// Container: <span class="event-clndr-3-day has-entries" data-events="...HTML...">
// Entry: <div class="event-clndr-3-entry">
// Title: <a href="/veranstaltungen/{ID}/{YEAR}/{MM}/{DD}/{slug}.html"><h4>TITLE</h4></a>
// Date: <div class="event-clndr-3-entry-duration"><time datetime="YYYY-MM-DD">...
// Time: <div class="event-clndr-3-entry-time"><time>HH:MM</time> Uhr bis ...

function extractEventsFromHtml(html: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];

  // Find all calendar cells that have events (class may include "active")
  const cellRx = /<span[^>]*class="event-clndr-3-day has-entries[^"]*"[^>]*data-events="([^"]+)"/g;
  let cellMatch: RegExpExecArray | null;

  while ((cellMatch = cellRx.exec(html)) !== null) {
    // data-events is double-encoded (attribute encoding + inner HTML encoding)
    const entriesHtml = decodeHtmlEntities(decodeHtmlEntities(cellMatch[1]!));

    // Split into individual event entries (exact class match to avoid splitting on sub-divs)
    const entryBlocks = entriesHtml.split(/(?=<div[^>]*class="event-clndr-3-entry">)/).filter((b) =>
      b.includes('class="event-clndr-3-entry"')
    );

    for (const block of entryBlocks) {
      // Extract URL and ID from href: /veranstaltungen/{ID}/...
      const urlMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/[^"]+\.html)"/);
      if (!urlMatch) continue;
      const urlPath = urlMatch[1]!;
      const id = `wriezen-${urlMatch[2]!}`;
      const url = `${BASE_URL}${urlPath}`;

      // Extract title from h4
      const titleMatch = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
      if (!titleMatch) continue;
      const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
      if (!title) continue;

      // Extract dates from URL (/veranstaltungen/{ID}/YYYY/MM/DD/slug.html) as fallback
      const urlDateMatch = urlPath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (!urlDateMatch) continue;
      const urlDate = `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`;

      // Duration block: <time datetime="YYYY-MM-DD"> for multi-day events
      const durationBlock = block.match(/<div[^>]*class="event-clndr-3-entry-duration[^"]*">([\s\S]*?)<\/div>/);
      let startDate: string;
      let endDate: string | undefined;

      if (durationBlock) {
        const dateMatches = [...durationBlock[1]!.matchAll(/datetime="(\d{4}-\d{2}-\d{2})"/g)];
        startDate = dateMatches.length > 0 ? `${dateMatches[0]![1]}T00:00:00.000Z` : `${urlDate}T00:00:00.000Z`;
        endDate = dateMatches.length > 1 ? `${dateMatches[dateMatches.length - 1]![1]}T00:00:00.000Z` : undefined;
      } else {
        startDate = `${urlDate}T00:00:00.000Z`;
      }

      events.push({
        id,
        title,
        url,
        startDate,
        ...(endDate && endDate !== startDate ? { endDate } : {}),
        fetchedAt: now,
        updatedAt: now,
      });
    }
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Source: wriezen.de/news/1 (PortUNA news)
// Container: <div class="news-entry-to-limit">
// Title: <h3>TITLE</h3>
// Date: DD.&#8203;MM.&#8203;YYYY: in text (zero-width spaces between digits)
// URL: <a href="/news/{ID}/{YEAR}/{MM}/{DD}/{slug}.html">

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*class="news-entry-to-limit")/).filter((b) =>
    b.includes("news-entry-to-limit")
  );

  for (const block of blocks) {
    // URL: /news/{category}/{id}/nachrichten/{slug}.html
    const urlMatch = block.match(/href="(\/news\/\d+\/(\d+)\/nachrichten\/[^"]+\.html)"/);
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!urlMatch || !titleMatch) continue;

    const urlPath = urlMatch[1]!;
    const newsId = urlMatch[2]!;
    const url = `${BASE_URL}${urlPath}`;
    const id = `wriezen-news-${newsId}`;

    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Date: "DD.MM.YYYY:" with optional zero-width spaces
    const text = decodeHtmlEntities(block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    const dateMatch = text.match(/(\d{1,2})\.(\d{2})\.(\d{4}):/);
    const publishedAt = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[1]!.padStart(2, "0")}T00:00:00.000Z`
      : undefined;

    news.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return news;
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
assertAllowed(robots, ["/veranstaltungen/index.php", "/news/1", "/amtsblatt/index.php"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Fetch events for current month + next 3 months
const now = new Date();
const monthUrls: string[] = [];
for (let i = 0; i < 4; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  monthUrls.push(`${EVENTS_BASE}?month=${month}`);
}

const [newsHtml, amtsblattHtml, ...monthHtmls] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  ...monthUrls.map((url) => fetch(url, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); })),
]);

// Collect all unique events across months (dedup by ID)
const allIncomingEvents: Map<string, Event> = new Map();
for (const html of monthHtmls) {
  for (const e of extractEventsFromHtml(html)) {
    if (!allIncomingEvents.has(e.id)) allIncomingEvents.set(e.id, e);
  }
}

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, [...allIncomingEvents.values()]);
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml!));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml!, AMTSBLATT_URL, "wriezen"));

const nowIso = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: nowIso, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: nowIso, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: nowIso, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
