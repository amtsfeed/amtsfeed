#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.heideblick.de";
const NEWS_URL = `${BASE_URL}/news/index.php?archiv=1&rubrik=1`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/​/g, "")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// Heideblick archive page: <h3 class="title_archive_NN legacy_h6">DD.MM.YYYY</h3>
//   followed by <ul><li><a href="/news/1/ID/nachrichten/slug.html">Title</a></li>...

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const src = html.replace(/&#8203;/g, "");

  const dateRx = /<h3[^>]*class="title_archive_\d+ legacy_h6"[^>]*>(\d{2})\.(\d{2})\.(\d{4})<\/h3>([\s\S]*?)(?=<h3[^>]*class="title_archive_|<h3[^>]*class="legacy_h4|<\/div><div class="monthBlock|$)/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dateRx.exec(src)) !== null) {
    const publishedAt = `${dm[3]}-${dm[2]}-${dm[1]}T00:00:00.000Z`;
    const block = dm[4] ?? "";
    const linkRx = /<a\s+href="(\/news\/\d+\/(\d+)\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRx.exec(block)) !== null) {
      const href = lm[1]!;
      const newsId = lm[2]!;
      const id = `heideblick-news-${newsId}`;
      if (seen.has(id)) continue;
      const title = decodeHtmlEntities((lm[3] ?? "").replace(/<[^>]+>/g, "").trim());
      if (!title || title === "mehr") continue;
      seen.add(id);
      items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now, updatedAt: now });
    }
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA events-entry-3: <div class="row events-entry-3">

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s[^>]*class="row events-entry-3")/)
    .filter((b) => /class="row events-entry-3"/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const [, href, eventId, yyyy, mm, dd] = linkMatch;

    const titleMatch = block.match(/<h[2-6][^>]*events-entry-3-headline[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const startDate = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    const id = `heideblick-event-${eventId}-${yyyy}${mm}${dd}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const locMatch = block.match(/<p[^>]*class="events-entry-3-location"[^>]*>([\s\S]*?)<\/p>/i);
    const location = locMatch
      ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    events.push({ id, title, url: `${BASE_URL}${href!}`, startDate, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// <tr><td>Nr. N/YYYY</td><td>DD.MM.YYYY</td>...<td>[<a href="...pdf">hier</a>]</td></tr>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rowRx = /<tr>\s*<td>Nr\.\s*([0-9a-z]+)\/(\d{4})<\/td>\s*<td>([\d.&#;]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html)) !== null) {
    const num = m[1]!;
    const year = m[2]!;
    const dateStr = m[3]!.replace(/&#\d+;/g, "");
    const dp = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dp) continue;
    const publishedAt = `${dp[3]}-${dp[2]}-${dp[1]}T00:00:00.000Z`;

    const linkCell = m[5]!;
    const linkMatch = linkCell.match(/<a\s[^>]*href="([^"]+\.pdf)"/i);
    const url = linkMatch ? linkMatch[1]! : AMTSBLATT_URL;

    const id = `heideblick-amtsblatt-${year}-${num.padStart(2, "0")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// <tr><td valign="top">DATE</td><td valign="top">TITLE</td><td valign="top">...<a href=".pdf">...</a></td></tr>

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRx = /<tr>\s*<td valign="top">([\d&#;.]+)<\/td>\s*<td valign="top">([\s\S]*?)<\/td>\s*(?:<td valign="top">([\s\S]*?)<\/td>\s*)?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html)) !== null) {
    const dateRaw = m[1]!.replace(/&#\d+;/g, "");
    const dateMatch = dateRaw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const titleCell = m[2]!;
    const title = decodeHtmlEntities(titleCell.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    let url = NOTICES_URL;
    const downloadCell = m[3] ?? "";
    const linkMatch = downloadCell.match(/<a\s[^>]*href="([^"]+)"/i);
    if (linkMatch) {
      const href = linkMatch[1]!;
      url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    }

    const slug = url.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 60).replace(/-+$/, "");
    const id = `heideblick-notice-${slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

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

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/amtsblatt/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };

const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
if (mergedAmtsblatt.length > 0)
  writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
if (mergedNotices.length > 0)
  writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge`);
console.log(`notices:   ${mergedNotices.length} Einträge`);
