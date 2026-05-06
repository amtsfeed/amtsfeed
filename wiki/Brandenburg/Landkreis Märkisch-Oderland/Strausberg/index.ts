#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.stadt-strausberg.de";
const EVENTS_BASE = `${BASE_URL}/veranstaltungen`;
const AMTSBLATT_URL = `${BASE_URL}/neue-strausberger-zeitung/`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const DE_MONTHS = [
  "januar", "februar", "marz", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "dezember",
];

function monthUrl(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${EVENTS_BASE}/${year}-${mm}-01/${DE_MONTHS[month - 1]}-${year}/`;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#038;/g, "&")
    .replace(/&#8203;/g, "").replace(/&#8230;/g, "…").replace(/&#8222;/g, "„")
    .replace(/&auml;/g, "ä").replace(/&Auml;/g, "Ä").replace(/&ouml;/g, "ö").replace(/&Ouml;/g, "Ö")
    .replace(/&uuml;/g, "ü").replace(/&Uuml;/g, "Ü").replace(/&szlig;/g, "ß").replace(/&eacute;/g, "é")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Source: stadt-strausberg.de/veranstaltungen/YYYY-MM-01/monthname-YYYY/
// WordPress site with custom rb_events post type.
//
// Container: <article class="rb-event-item rb-event-item-id-{ID}-{YYYY-MM-DD} rb-event-item_cat_*">
// Anchor: <a id="veranstaltungen-{ID}-{YYYY-MM-DD}">
// Title: <h3>TITLE</h3>
// Date: <time datetime="YYYY-MM-DD">
// Location: <address class="rb-event-item-location">TEXT</address>
// URL: {EVENTS_BASE}/YYYY-MM-01/monthname-YYYY/#veranstaltungen-{ID}-{YYYY-MM-DD}
// Recurring events: same ID, different dates → composite ID {ID}-{YYYY-MM-DD}

function extractEvents(html: string, pageUrl: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];

  const articleRx = /<article\s+class="rb-event-item\s+rb-event-item-id-(\d+)-(\d{4}-\d{2}-\d{2})[^"]*"([\s\S]*?)<\/article>/g;
  let m: RegExpExecArray | null;

  while ((m = articleRx.exec(html)) !== null) {
    const eventId = m[1]!;
    const dateStr = m[2]!;
    const body = m[3]!;

    const titleMatch = body.match(/<h3>([\s\S]*?)<\/h3>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const locationMatch = body.match(/<address[^>]*class="rb-event-item-location"[^>]*>([\s\S]*?)<\/address>/);
    const location = locationMatch
      ? decodeHtmlEntities(locationMatch[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : undefined;

    const id = `strausberg-${eventId}-${dateStr.replace(/-/g, "")}`;
    const anchor = `veranstaltungen-${eventId}-${dateStr}`;
    const url = `${pageUrl}#${anchor}`;

    events.push({
      id,
      title,
      url,
      startDate: `${dateStr}T00:00:00.000Z`,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// News feed at /aktuelles/feed/ is disallowed by robots.txt (*/feed/).
// Individual article URLs redirect to /aktuelles/#post-{ID}.
// Strategy:
//   1. Fetch rb_news-sitemap.xml → list of (url, lastmod), take 20 most recent
//   2. HEAD each URL to follow redirect → extract post ID from Location: /aktuelles/#post-{ID}
//   3. Fetch /aktuelles/ HTML → build {postID: title} map
//   4. Combine into NewsItem[]

const NEWS_SITEMAP_URL = `${BASE_URL}/rb_news-sitemap.xml`;
const NEWS_HTML_URL = `${BASE_URL}/aktuelles/`;
const NEWS_LIMIT = 20;

function parseSitemapUrls(xml: string): Array<{ url: string; lastmod: string }> {
  const items: Array<{ url: string; lastmod: string }> = [];
  const blockRx = /<url>([\s\S]*?)<\/url>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRx.exec(xml)) !== null) {
    const block = m[1]!;
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (!locMatch) continue;
    const url = locMatch[1]!.trim();
    const lastmod = lastmodMatch?.[1]?.trim() ?? "";
    if (url !== `${BASE_URL}/aktuelles/`) items.push({ url, lastmod });
  }
  return items;
}

function extractNewsTitles(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const rx = /<div[^>]*class="rb-news-item rb-news-item-id(\d+)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const postId = m[1]!;
    const title = decodeHtmlEntities(m[2]!.replace(/<[^>]+>/g, "").trim());
    if (title) map.set(postId, title);
  }
  return map;
}

async function fetchRecentNews(hdrs: Record<string, string>): Promise<NewsItem[]> {
  const now = new Date().toISOString();

  const [sitemapXml, newsHtml] = await Promise.all([
    fetch(NEWS_SITEMAP_URL, { headers: hdrs }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_SITEMAP_URL}`); return r.text(); }),
    fetch(NEWS_HTML_URL, { headers: hdrs }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_HTML_URL}`); return r.text(); }),
  ]);

  const allSitemapItems = parseSitemapUrls(sitemapXml);
  // Sort by lastmod descending, take most recent
  allSitemapItems.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
  const recent = allSitemapItems.slice(0, NEWS_LIMIT);

  const titleMap = extractNewsTitles(newsHtml);

  // HEAD each URL to get post ID from redirect Location header
  const resolved = await Promise.all(
    recent.map(async ({ url, lastmod }) => {
      try {
        const res = await fetch(url, { headers: hdrs, redirect: "manual" });
        const location = res.headers.get("location") ?? "";
        const postIdMatch = location.match(/#post-(\d+)$/);
        if (!postIdMatch) return null;
        const postId = postIdMatch[1]!;
        const title = titleMap.get(postId);
        if (!title) return null;
        const publishedAt = lastmod ? new Date(lastmod).toISOString() : undefined;
        return { id: `strausberg-news-${postId}`, title, url, publishedAt, fetchedAt: now, updatedAt: now };
      } catch {
        return null;
      }
    })
  );

  return resolved.filter((n): n is NewsItem => n !== null);
}

// ── Notices ───────────────────────────────────────────────────────────────────
// WordPress accordion. Each item:
//   <div class="panel-heading" role="tab" id="rb_dasl_accordion_1_headingN">
//     <h4 class="panel-title">
//       <a ... href="#rb_dasl_accordion_1_collapseN">TITLE</a>
//   The anchor id is rb_dasl_accordion_1_collapseN_anchor
// No dates present → use page dateModified from JSON-LD or fall back to fetchedAt.

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();

  // Try to get page dateModified from JSON-LD
  const jsonLdMatch = html.match(/"dateModified":"([^"]+)"/);
  const pageDate = jsonLdMatch ? new Date(jsonLdMatch[1]!).toISOString() : now;

  // Split on accordion heading divs
  const headingRx = /class="panel panel-default rb_dasl_accordion_\d+_article\s*">([\s\S]*?)(?=class="panel panel-default rb_dasl_accordion_|<\/div>\s*<\/section>)/g;
  let m: RegExpExecArray | null;
  while ((m = headingRx.exec(html)) !== null) {
    const block = m[1]!;

    // Extract collapse ID from anchor href
    const hrefMatch = block.match(/href="#(rb_dasl_accordion_\d+_collapse\d+)"/);
    if (!hrefMatch) continue;
    const collapseId = hrefMatch[1]!;

    // Extract title from panel-title link text
    const titleMatch = block.match(/<h4 class="panel-title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!title) continue;

    // Generate a stable slug from collapse id
    const numMatch = collapseId.match(/collapse(\d+)$/);
    const num = numMatch ? numMatch[1]!.padStart(3, "0") : collapseId;
    const id = `strausberg-notice-${num}`;

    items.push({
      id,
      title,
      url: `${NOTICES_URL}#${collapseId}_anchor`,
      publishedAt: pageDate,
      fetchedAt: now,
    });
  }
  return items;
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// WordPress NSZ page — only Amtsblatt PDFs (not NSZ Zeitung PDFs)
// Year from wp-content path: /wp-content/uploads/YYYY/MM/
// Issue number from filename — messy patterns, multiple strategies:
//   YYYY-NN-Amtsblatt.pdf, YYYY_NN_Amtsblatt.pdf, Amtsblatt_NN-YYYY.pdf,
//   Amtsblatt_Nr3.pdf, Amtsblatt-NN_2025.pdf, etc.
// publishedAt = first of upload month (best available approximation)

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items = new Map<string, AmtsblattItem>();
  const now = new Date().toISOString();
  const rx = /href="(https:\/\/www\.stadt-strausberg\.de\/wp-content\/uploads\/(\d{4})\/(\d{2})\/([^"]*Amtsblatt[^"]*\.pdf))"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!;
    const uploadYear = m[2]!;
    const uploadMonth = m[3]!;
    const filename = m[4]!.toLowerCase().replace(/\.pdf$/, "");

    // Skip NSZ-only files (they contain "nsz" but not "amtsblatt" — but we already filter to Amtsblatt)
    // Skip Sonderausgabe
    if (filename.includes("sonder")) continue;

    let issueNum: string | undefined;
    let issueYear: string | undefined;

    // YYYY-NN-Amtsblatt or YYYY_NN_Amtsblatt
    const y1 = filename.match(/^(\d{4})[-_]0*(\d{1,2})[-_]amtsblatt/);
    if (y1) { issueYear = y1[1]!; issueNum = y1[2]!.padStart(2, "0"); }

    // Amtsblatt_NN-YYYY or Amtsblatt-NN-YYYY or Amtsblatt_NN_YYYY
    if (!issueNum) {
      const y2 = filename.match(/amtsblatt[-_]0*(\d{1,2})[-_](\d{4})/);
      if (y2) { issueNum = y2[1]!.padStart(2, "0"); issueYear = y2[2]!; }
    }

    // Amtsblatt_0N_YYYY_... or _NN_Amtsblatt_... (number before/after amtsblatt)
    if (!issueNum) {
      const y3 = filename.match(/[-_]0*(\d{1,2})[-_](?:amtsblatt|srb)|amtsblatt[-_]0*(\d{1,2})(?:[-_]|$)/);
      if (y3) {
        issueNum = (y3[1] ?? y3[2])!.padStart(2, "0");
        issueYear = uploadYear;
      }
    }

    // Explicit Nr: Nr3, Nr.3, Nr_3
    if (!issueNum) {
      const y4 = filename.match(/nr\.?\s*0*(\d{1,2})/i);
      if (y4) { issueNum = y4[1]!.padStart(2, "0"); issueYear = uploadYear; }
    }

    if (!issueNum) continue;
    if (!issueYear) issueYear = uploadYear;

    const id = `strausberg-amtsblatt-${issueYear}-${issueNum}`;
    if (!items.has(id)) {
      items.set(id, {
        id,
        title: `Amtsblatt Nr. ${issueNum}/${issueYear}`,
        url,
        publishedAt: `${uploadYear}-${uploadMonth}-01T00:00:00.000Z`,
        fetchedAt: now,
      });
    }
  }
  return [...items.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
assertAllowed(robots, ["/veranstaltungen/", "/aktuelles/", "/rb_news-sitemap.xml", "/neue-strausberger-zeitung/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Current month + next 2 months
const now = new Date();
const monthFetches: Array<{ url: string; promise: Promise<string> }> = [];
for (let i = 0; i < 3; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
  const url = monthUrl(d.getFullYear(), d.getMonth() + 1);
  monthFetches.push({
    url,
    promise: fetch(url, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); }),
  });
}

const [incomingNews, amtsblattHtml, noticesHtml, ...monthResults] = await Promise.all([
  fetchRecentNews(headers),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  ...monthFetches.map((f) => f.promise),
]);

const allIncomingEvents: Map<string, Event> = new Map();
for (let i = 0; i < monthFetches.length; i++) {
  const pageUrl = monthFetches[i]!.url;
  for (const e of extractEvents(monthResults[i]!, pageUrl)) {
    if (!allIncomingEvents.has(e.id)) allIncomingEvents.set(e.id, e);
  }
}

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, [...allIncomingEvents.values()]);
const mergedNews = mergeNews(existingNews.items, incomingNews);
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml ?? ""));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml ?? ""));

const nowIso = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: nowIso, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: nowIso, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: nowIso, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: nowIso, items: mergedNotices }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
