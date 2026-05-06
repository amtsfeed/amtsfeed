#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.gemeinde-tauche.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function startDateFromUrl(href: string): string {
  const m = href.match(/\/veranstaltungen\/\d+\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}

// ── Events ────────────────────────────────────────────────────────────────────
// Newer PortUNA template: class="event-entry ..."

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s[^>]*class="[^"]*\bevent-entry\b)/)
    .filter((b) => /class="[^"]*\bevent-entry\b/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;

    const titleMatch = block.match(/<h[2-6][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/class="event-time[^"]*"\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    const startDateBase = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : startDateFromUrl(href);

    const timeBlockIdx = block.indexOf('class="event-time-start"');
    const timeSlice = timeBlockIdx >= 0 ? block.slice(timeBlockIdx, timeBlockIdx + 200) : "";
    const times = [...timeSlice.matchAll(/<time>(\d{2}:\d{2})<\/time>/g)].map((m) => m[1]);

    const startDate = times[0]
      ? startDateBase.replace("T00:00:00.000Z", `T${times[0]}:00.000Z`)
      : startDateBase;
    const endDate = times[1]
      ? startDateBase.replace("T00:00:00.000Z", `T${times[1]}:00.000Z`)
      : undefined;

    const locMatch = block.match(/<a[^>]*class="location-info"[^>]*>([\s\S]*?)<\/a>/i);
    const location = locMatch
      ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    events.push({
      id: href.replace(/^\//, "").replace(/\//g, "-"),
      title,
      url: `${BASE_URL}${href}`,
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
// Newer PortUNA news: news-entry-to-limit row events-entry-3 with events-entry-3-time datetime

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=class="[^"]*\bnews-entry-to-limit\b)/)
    .filter((b) => /class="[^"]*\bnews-entry-to-limit\b/.test(b));

  for (const block of blocks) {
    const hMatch = block.match(/<h[2-6][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!hMatch) continue;

    const href = hMatch[1]!;
    const title = decodeHtmlEntities((hMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dtMatch = block.match(/class="events-entry-3-time[^"]*"\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    const publishedAt = dtMatch ? `${dtMatch[1]}T00:00:00.000Z` : now;

    const idMatch = href.match(/\/news\/\d+\/(\d+)\//);
    const id = idMatch ? idMatch[1]! : href;

    items.push({
      id,
      title,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Newer PortUNA gazette-tab with <time datetime="YYYY-MM-DD">

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const blocks = html.split(/<article\s[^>]*class="gazette-tab/).filter((_, i) => i > 0);
  for (const block of blocks) {
    const numMatch = block.match(/<h3[^>]*>Ausgabe Nr\.\s*(\d+)\/(\d{4})<\/h3>/);
    if (!numMatch) continue;
    const num = numMatch[1]!.padStart(2, "0");
    const year = numMatch[2]!;
    const dateMatch = block.match(/<time\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[1]}T00:00:00.000Z`;
    items.push({
      id: `tauche-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: AMTSBLATT_URL,
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

// ── Notices ───────────────────────────────────────────────────────────────────
// Verwaltungsportal.de newer layout:
// <tr><td valign="top">DD.&#8203;MM.&#8203;YYYY</td>
// <td valign="top">Title text</td>
// <td valign="top"><div title="..."><a target="_blank" href="...">filename</a></div></td>

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
    const id = `tauche-notice-${slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/", "/news/", "/amtsblatt/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
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
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
