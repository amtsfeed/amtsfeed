#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Schönefeld (gemeinde-schoenefeld.de)
 *
 * The site has no wp/v2/posts endpoint — all news and events are rendered as
 * static pages via a custom WP theme (pn-gemeinde-schoenefeld-theme).
 *
 * News list:       https://www.schoenefeld.de/news/  (HTTP, follows redirect)
 * Events list:     https://www.schoenefeld.de/mein-schoenefeld/veranstaltungen/
 * Amtsblatt page:  https://www.schoenefeld.de/presse/amtsblatt/
 *
 * HTTP (not HTTPS) is used because the www.schoenefeld.de → gemeinde-schoenefeld.de
 * redirect chain and TLS quirks make HTTPS unreliable for the entry point.
 * The HTML itself contains canonical https://gemeinde-schoenefeld.de/ URLs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AmtsblattFile, AmtsblattItem, EventsFile, Event, NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

// Use www.schoenefeld.de as the entry point (redirects to gemeinde-schoenefeld.de).
const BASE_URL = "http://www.schoenefeld.de";
const CANONICAL_BASE = "https://gemeinde-schoenefeld.de";
const NEWS_URL = `${BASE_URL}/news/`;
const EVENTS_URL = `${BASE_URL}/mein-schoenefeld/veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/presse/amtsblatt/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtml(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#038;/g, "&");
}

// Parse "DD.MM.YY" or "DD.MM.YYYY" date strings to ISO
function parseShortDate(dateStr: string): string | undefined {
  const m2 = dateStr.trim().match(/^(\d{1,2})\.(\d{2})\.(\d{2})$/);
  if (m2) {
    const year = parseInt(m2[3]!, 10) + 2000;
    return `${year}-${m2[2]!}-${m2[1]!.padStart(2, "0")}T00:00:00.000Z`;
  }
  const m4 = dateStr.trim().match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
  if (m4) return `${m4[3]!}-${m4[2]!}-${m4[1]!.padStart(2, "0")}T00:00:00.000Z`;
  return undefined;
}

// ── News extraction ───────────────────────────────────────────────────────────
// HTML: <div class="news-list-entry cat--X">
//         <a href="https://gemeinde-schoenefeld.de/news/aktuelles/SLUG/">
//           <div class="news-list-inner">
//             <h3 class="news-list-inner--title">TITLE</h3>
//             <div class="news-list-inner--date">DD.MM.YY<span ...>...</span></div>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const entryRx = /<div\s+class="news-list-entry\s+cat--[^"]+">[\s\S]{0,100}<a\s+href="(https?:\/\/(?:www\.)?(?:gemeinde-)?schoenefeld\.de\/news\/[^"]+)"[^>]*>[\s\S]{0,600}?<h3\s+class="news-list-inner--title">([\s\S]{0,200}?)<\/h3>[\s\S]{0,200}?<div\s+class="news-list-inner--date">([\s\S]{0,50}?)<(?:span|\/div)/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRx.exec(html)) !== null) {
    const rawUrl = m[1]!;
    const title = decodeHtml((m[2] ?? "").replace(/<[^>]+>/g, "").trim());
    const dateRaw = (m[3] ?? "").replace(/<[^>]+>/g, "").trim();
    if (!title) continue;

    // Canonicalize URL to gemeinde-schoenefeld.de https
    const url = rawUrl.replace(/^https?:\/\/(?:www\.)?schoenefeld\.de/, CANONICAL_BASE)
      .replace(/^https?:\/\/(?:www\.)?gemeinde-schoenefeld\.de/, CANONICAL_BASE);

    // Use slug as ID
    const slugMatch = url.match(/\/news\/[^/]+\/([^/]+)\/?$/);
    const slug = slugMatch ? slugMatch[1]! : url.replace(/[^a-z0-9]+/gi, "-").slice(-40);
    const id = `schoenefeld-news-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = parseShortDate(dateRaw);
    items.push({
      id,
      title,
      url,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events extraction ─────────────────────────────────────────────────────────
// HTML: <div class="veranstaltung-list-entry cat--X">
//         <a href="https://gemeinde-schoenefeld.de/veranstaltung/SLUG/">
//           <div class="veranstaltung-list-inner">
//             <div class="veranstaltung-list-inner--date col-2">DD.MM.YY </div>
//             <h3 class="veranstaltung-list-inner--content-title">TITLE</h3>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const entryRx = /<div\s+class="veranstaltung-list-entry\s+cat--[^"]+">[\s\S]{0,100}<a\s+href="(https?:\/\/(?:www\.)?(?:gemeinde-)?schoenefeld\.de\/veranstaltung\/[^"]+)"[^>]*>[\s\S]{0,200}?<div\s+class="veranstaltung-list-inner--date\s+col-2">([\s\S]{0,30}?)<\/div>[\s\S]{0,200}?<h3\s+class="veranstaltung-list-inner--content-title">([\s\S]{0,200}?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRx.exec(html)) !== null) {
    const rawUrl = m[1]!;
    const dateRaw = (m[2] ?? "").replace(/<[^>]+>/g, "").trim();
    const title = decodeHtml((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const url = rawUrl.replace(/^https?:\/\/(?:www\.)?schoenefeld\.de/, CANONICAL_BASE)
      .replace(/^https?:\/\/(?:www\.)?gemeinde-schoenefeld\.de/, CANONICAL_BASE);

    const slugMatch = url.match(/\/veranstaltung\/([^/]+)\/?$/);
    const slug = slugMatch ? slugMatch[1]! : url.replace(/[^a-z0-9]+/gi, "-").slice(-40);
    const id = `schoenefeld-event-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const startDate = parseShortDate(dateRaw) ?? now;
    events.push({ id, title, url, startDate, fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt extraction ──────────────────────────────────────────────────────
// From 2023 onward: WP upload PDFs with filenames like Amtsblatt-YYYY_NN.pdf or Amtsblatt-YYYY_N.pdf
// Older: https://www.gemeinde-schoenefeld.de/amtsblatt.html?file=tl_files/Amtsblatt/YYYY/Amtsblatt%20NN-YY.pdf

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Modern WP uploads: <a href="https://gemeinde-schoenefeld.de/wp-content/uploads/YYYY/MM/Amtsblatt-YYYY_NN.pdf">Amtsblatt NN_YY.pdf</a>
  const wpRx = /<a\s+[^>]*href="(https:\/\/(?:www\.)?gemeinde-schoenefeld\.de\/wp-content\/uploads\/(\d{4})\/(\d{2})\/Amtsblatt-(\d{4})_(\d+)\.pdf)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = wpRx.exec(html)) !== null) {
    const url = m[1]!;
    const uploadYear = m[2]!;
    const uploadMonth = m[3]!;
    const year = m[4]!;
    const num = m[5]!.padStart(2, "0");
    const id = `schoenefeld-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // Use upload month as approximate date (upload date ~ publish date)
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url,
      publishedAt: `${uploadYear}-${uploadMonth}-01T00:00:00.000Z`,
      fetchedAt: now,
    });
  }

  // Legacy tl_files: Amtsblatt%20NN-YY.pdf — extract year/number from filename
  const legacyRx = /href="(https?:\/\/(?:www\.)?gemeinde-schoenefeld\.de\/amtsblatt\.html\?file=tl_files\/Amtsblatt\/(\d{4})\/Amtsblatt%20(\d+)-(\d{2})\.pdf)"/gi;
  while ((m = legacyRx.exec(html)) !== null) {
    const url = m[1]!;
    const year = m[2]!;
    const num = m[3]!.padStart(2, "0");
    const id = `schoenefeld-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url,
      publishedAt: `${year}-01-01T00:00:00.000Z`,
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
assertAllowed(robots, ["/news/", "/mein-schoenefeld/", "/presse/"]);

const headers = { "User-Agent": AMTSFEED_UA };

async function fetchWithRetry(url: string, hdrs: Record<string, string>, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: hdrs });
    if (res.ok) return res.text();
    if (res.status === 504 && i < retries - 1) continue; // retry on gateway timeout
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetchWithRetry(NEWS_URL, headers),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
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
