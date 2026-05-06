#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-b-f.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/index.php?rubrik=1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/veroeffentlichung/typ/2608/amtliche%20Bekanntmachungen.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&ndash;/g, "\u2013")
    .replace(/&bdquo;/g, "\u201e").replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
    .replace(/&#8203;/g, "").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanLongDate(dateStr: string): string {
  const m = dateStr.trim().match(/(\d{1,2})\.\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (!m) return new Date().toISOString();
  const mm = GERMAN_MONTHS[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

// ── Events ────────────────────────────────────────────────────────────────────
// Verwaltungsportal: <div class="event-entry-new-2">
//   <div class="event-entry-new-2-location"><a>Location</a></div>
//   <h2><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">Title</a></h2>
//   <time datetime="YYYY-MM-DD">DD. Month YYYY</time>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div class="event-entry-new-2">)/)
    .filter((b) => /class="event-entry-new-2"/.test(b));

  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const eventId = hrefMatch[2]!;

    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const startDate = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : now;

    const locMatch = block.match(/event-entry-new-2-location[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const location = locMatch
      ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    events.push({
      id: `brieskow-finkenheerd-event-${eventId}`,
      title,
      url: `${BASE_URL}${href}`,
      startDate,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Verwaltungsportal: <div class="news-entry-new">
//   <a href="/news/1/ID/nachrichten/slug.html" class="news-entry-new-link">
//   <div class="news-entry-new-date"><div class="news-entry-new-time ...">
//     <span class="news-entry-new-week-day">Mo, </span>DD. Month YYYY</div></div>
//   <h3 class="legacy_h5">Title</h3>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div class="news-entry-new">)/)
    .filter((b) => /class="news-entry-new"/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/news\/\d+\/(\d+)\/nachrichten\/[^"]+)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const id = linkMatch[2]!;

    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const timeMatch = block.match(/news-entry-new-time[^>]*>[\s\S]*?<\/span>([\s\S]*?)<\/div>/);
    const dateRaw = timeMatch ? (timeMatch[1] ?? "").trim() : "";
    const publishedAt = dateRaw ? parseGermanLongDate(decodeHtmlEntities(dateRaw)) : now;

    items.push({
      id,
      title,
      url: `${BASE_URL}${href}`,
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Verwaltungsportal table: <td>Nr. N/YYYY</td><td>DD.&#8203;MM.&#8203;YYYY</td>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>(Nr\.\s*(\d+)\/(\d{4}))<\/td>\s*<td>([\d.&#; ]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[2]!.padStart(2, "0");
    const year = m[3]!;
    const dateStr = m[4]!.replace(/&#[^;]+;/g, "").replace(/\.+/g, ".").trim();
    const dateParts = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]!.padStart(2, "0")}-${dateParts[1]!.padStart(2, "0")}T00:00:00.000Z`;
    items.push({
      id: `brieskow-finkenheerd-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: AMTSBLATT_URL,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// gazette-style table: publication_NNNN form, title in <p class="tiny_p hidden-xs">, date in <td class="hidden-xs">

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  // Each publication row has form name="publication_NNNN" (desktop version)
  // Title: <p class="tiny_p hidden-xs">TITLE</p>
  // Date: <td class="hidden-xs">DD.MM.YYYY</td>
  const rows = html.split(/(?=<tr>)/).filter((b) => /publication_\d+[^_]/.test(b) && /hidden-xs/.test(b));
  for (const row of rows) {
    const idMatch = row.match(/name="(publication_(\d+))"[^>]*>/);
    if (!idMatch) continue;
    const pubId = idMatch[2]!;

    const titleMatch = row.match(/<p class="tiny_p hidden-xs">([\s\S]*?)<\/p>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = row.match(/<td class="hidden-xs">([\d.&#;]+)<\/td>/);
    let publishedAt = now;
    if (dateMatch) {
      const dateStr = dateMatch[1]!.replace(/&#[^;]+;/g, "").replace(/\.+/g, ".").trim();
      const dateParts = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dateParts) {
        publishedAt = `${dateParts[3]}-${dateParts[2]!.padStart(2, "0")}-${dateParts[1]!.padStart(2, "0")}T00:00:00.000Z`;
      }
    }

    items.push({
      id: `amt-brieskow-finkenheerd-notice-${pubId}`,
      title,
      url: NOTICES_URL,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
    else byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)!.fetchedAt });
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

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
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/amtsblatt/", "/veroeffentlichung/"]);

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
