#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-wusterwitz.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/index.php?rubrik=1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
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

function parseNewsDate(context: string): string {
  const decoded = decodeHtmlEntities(context);
  const longMatch = decoded.match(/(\d{1,2})\.\s+([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
  if (longMatch) {
    const mm = GERMAN_MONTHS[longMatch[2] ?? ""] ?? "01";
    return `${longMatch[3]}-${mm}-${(longMatch[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
  }
  const shortMatch = decoded.match(/(\d{2})\.(\d{2})\.(\d{4}):/);
  if (shortMatch) return `${shortMatch[3]}-${shortMatch[2]!}-${shortMatch[1]!}T00:00:00.000Z`;
  return new Date().toISOString();
}

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rx = /<a\b[^>]*href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[^>]*>\s*(?!<img\b)([\s\S]{1,300}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!; const eventId = m[2]!;
    if (seen.has(eventId)) continue;
    const title = decodeHtmlEntities((m[6] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title || title.length < 3) continue;
    seen.add(eventId);
    const startDate = `${m[3]}-${m[4]}-${m[5]}T00:00:00.000Z`;
    const after = html.slice(m.index, m.index + 600);
    const timeMatch = after.match(/<time[^>]*>(\d{2}:\d{2})<\/time>/i)
      ?? after.match(/Zeit:<\/strong>\s*(\d{2}:\d{2})/i);
    const startDateTime = timeMatch ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`) : startDate;
    const locMatch = after.match(/Ort:<\/strong>\s*([^<]+)/i);
    const location = locMatch ? decodeHtmlEntities(locMatch[1]!.trim()) : undefined;
    events.push({ id: `amt-wusterwitz-event-${eventId}`, title, url: `${BASE_URL}${href}`, startDate: startDateTime, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }
  return events;
}

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rx = /<h[234][^>]*>\s*<a href="(\/news\/\d+\/(\d+)\/(?:nachrichten|kategorie)\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[234]>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!; const id = m[2]!;
    if (seen.has(id)) continue; seen.add(id);
    const title = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const context = html.slice(Math.max(0, m.index - 300), m.index + 300);
    items.push({ id, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt: parseNewsDate(context), updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>(Nr\.\s*(\d+)\/(\d{4}))<\/td>\s*<td>([\d.&#; ]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[2]!.padStart(2, "0"); const year = m[3]!;
    const dateStr = m[4]!.replace(/&#[^;]+;/g, "").replace(/\.+/g, ".").trim();
    const dateParts = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]!.padStart(2, "0")}-${dateParts[1]!.padStart(2, "0")}T00:00:00.000Z`;
    items.push({ id: `amt-wusterwitz-amtsblatt-${year}-${num}`, title: `Amtsblatt Nr. ${num}/${year}`, url: AMTSBLATT_URL, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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

  // Each row: date cell, title cell, optional download cell
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

    // Try download cell first, fall back to NOTICES_URL
    let url = NOTICES_URL;
    const downloadCell = m[3] ?? "";
    const linkMatch = downloadCell.match(/<a\s[^>]*href="([^"]+)"/i);
    if (linkMatch) {
      const href = linkMatch[1]!;
      url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    }

    const slug = url.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 60).replace(/-+$/, "");
    const id = `amt-wusterwitz-notice-${slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
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

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/amtsblatt/", "/bekanntmachungen/"]);

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
