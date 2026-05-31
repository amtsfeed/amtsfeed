#!/usr/bin/env tsx
/**
 * Scraper for Stadt Rathenow (TYPO3 + EXT:news / Custom Events).
 * https://www.rathenow.de
 *
 * News (Pressemitteilungen): /verwaltung-politik/presse/pressemitteilungen/
 *   - TYPO3 EXT:news Standard, <div class="article articletype-0">
 *   - Datum: <time itemprop="datePublished" datetime="YYYY-MM-DD">
 *   - Paginierung: /seite-N/
 *
 * Events: /kultur-tourismus/veranstaltungskalender/alle-events-im-ueberblick/
 *   - Custom Extension (rtn_events): <div class="c-event">
 *   - Datum: <p class="c-event__dates">DD.MM.YYYY[ - DD.MM.YYYY]
 *   - Event-ID aus iCal-Link: tx_rtnevents_list[event]=N
 *
 * Bekanntmachungen: /online-bekanntmachungen/oeffentliche-bekanntmachungen/
 *   - HTML-Tabelle, Datum in <time datetime>, Titel in 2. Spalte, PDF in 3. Spalte
 *
 * Amtsblatt: nicht vorhanden (kein offizielles Amtsblatt-Format auf der Website).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "rathenow";
const BASE_URL = "https://www.rathenow.de";
const NEWS_BASE = `${BASE_URL}/verwaltung-politik/presse/pressemitteilungen/`;
const EVENTS_URL = `${BASE_URL}/kultur-tourismus/veranstaltungskalender/alle-events-im-ueberblick/`;
const NOTICES_URL = `${BASE_URL}/online-bekanntmachungen/oeffentliche-bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const NEWS_MAX_PAGES = 5;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseGermanDate(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
  return null;
}

// ── News (TYPO3 EXT:news) ─────────────────────────────────────────────────────
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s+class="article articletype-0")/).filter((b) => b.includes("articletype-0"));
  for (const block of blocks) {
    const dateMatch = block.match(/<time\s+itemprop="datePublished"\s+datetime="(\d{4}-\d{2}-\d{2})"/i);
    const linkMatch = block.match(/<h3>\s*<a\s+title="[^"]*"\s+href="([^"]+)"[^>]*>\s*<span\s+itemprop="headline">([\s\S]*?)<\/span>/i);
    if (!dateMatch || !linkMatch) continue;
    const href = linkMatch[1]!;
    const title = stripTags(linkMatch[2] ?? "");
    if (!title) continue;

    const slugMatch = href.match(/\/detail\/([^/]+)\/?$/);
    const slug = slugMatch ? slugMatch[1]! : encodeURIComponent(href).slice(0, 60);
    const id = `${SLUG}-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const publishedAt = `${dateMatch[1]}T00:00:00.000Z`;

    items.push({ id, title, url, publishedAt, fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Events ────────────────────────────────────────────────────────────────────
function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Split by <div class="c-event">
  const blocks = html.split(/(?=<div\s+class="c-event">)/).filter((b) => b.includes('class="c-event"'));
  for (const block of blocks) {
    const titleMatch = block.match(/<h3\s+class="u-red"[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;
    const title = stripTags(titleMatch[1] ?? "");
    if (!title || title.length < 3) continue;

    const datesMatch = block.match(/<p\s+class="c-event__dates"[^>]*>([\s\S]*?)<\/p>/i);
    if (!datesMatch) continue;
    const datesText = stripTags(datesMatch[1] ?? "");
    const dm = datesText.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s*-\s*(\d{2})\.(\d{2})\.(\d{4}))?/);
    if (!dm) continue;
    const startDate = `${dm[3]}-${dm[2]}-${dm[1]}T00:00:00.000Z`;
    const endDate = dm[6] ? `${dm[6]}-${dm[5]}-${dm[4]}T00:00:00.000Z` : undefined;

    // Event-ID aus iCal-Link extrahieren
    const idMatch = block.match(/tx_rtnevents_list%5Bevent%5D=(\d+)/);
    if (!idMatch) continue;
    const eventId = idMatch[1]!;

    const linkMatch = block.match(/<a[^>]+href="(\/kultur-tourismus\/veranstaltungskalender\/[^"]*?\/detail\/[^"]+\/)"/i);
    const url = linkMatch ? `${BASE_URL}${linkMatch[1]!}` : EVENTS_URL;

    const locMatch = block.match(/<p\s+class="c-event__location"[^>]*>([\s\S]*?)<\/p>/i);
    const location = locMatch ? stripTags(locMatch[1] ?? "") : undefined;

    const id = `${SLUG}-event-${eventId}-${startDate.slice(0, 10).replace(/-/g, "")}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
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

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Bekanntmachungen ──────────────────────────────────────────────────────────
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Zeilen: <tr><td class="news-list-date ..."><time datetime="YYYY-MM-DD">...</td><td>TITEL</td><td><a href="...pdf">...</a></td></tr>
  const rowRe = /<tr>\s*<td[^>]*class="news-list-date[^"]*"[^>]*>\s*<time\s+itemprop="datePublished"\s+datetime="(\d{4}-\d{2}-\d{2})"[^>]*>[\s\S]*?<\/time>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const publishedAt = `${m[1]}T00:00:00.000Z`;
    const title = stripTags(m[2] ?? "");
    if (!title) continue;
    const linkMatch = (m[3] ?? "").match(/href="([^"]+)"/i);
    const url = linkMatch ? (linkMatch[1]!.startsWith("http") ? linkMatch[1]! : `${BASE_URL}${linkMatch[1]!}`) : NOTICES_URL;

    const id = `${SLUG}-notice-${m[1]}-${title.slice(0, 50).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
    else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
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
assertAllowed(robots, [
  "/verwaltung-politik/presse/pressemitteilungen/",
  "/kultur-tourismus/veranstaltungskalender/",
  "/online-bekanntmachungen/",
]);

const headers = { "User-Agent": AMTSFEED_UA };

// News: über mehrere Seiten paginiert
const allNews: NewsItem[] = [];
for (let page = 1; page <= NEWS_MAX_PAGES; page++) {
  const url = page === 1 ? NEWS_BASE : `${NEWS_BASE}seite-${page}/`;
  const r = await fetch(url, { headers });
  if (!r.ok) break;
  const html = await r.text();
  const items = extractNews(html);
  if (items.length === 0) break;
  allNews.push(...items);
}

const [eventsHtml, noticesHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, allNews);
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
