#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://oranienburg.de";
const NEWS_URL = `${BASE_URL}/Rathaus-Service/Aktuelles/Meldungen/`;
const EVENTS_URL = `${BASE_URL}/Stadtleben/Kultur-Freizeit/Veranstaltungskalender/`;
const NOTICES_URL = `${BASE_URL}/Rathaus-Service/Aktuelles/Bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// IKISS CMS news list:
// <small class="date">DD.MM.YYYY</small>
// <h4 class="liste-titel"><a href="/...Slug.php?...&FID=2967.NNNN.1&...">Title</a></h4>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<small\s+class="date">(\d{2})\.(\d{2})\.(\d{4})<\/small>[\s\S]{0,400}?<h4\s+class="liste-titel"><a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[4]!;
    const title = decodeHtmlEntities((m[5] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const fidMatch = href.match(/FID=\d+\.(\d+)\.\d+/);
    const id = fidMatch ? `oranienburg-news-${fidMatch[1]!}` : `oranienburg-news-${encodeURIComponent(href).slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// IKISS CMS events list:
// <article class="elem row" data-ikiss-mfid="11.2967.NNNN.1">
//   <small class="date">DD.MM.YYYY[ bis DD.MM.YYYY]</small>
//   <h4 class="liste-titel"><a href="/...FID=2967.NNNN.1...">Title</a></h4>
// </article>

function parseDDMMYYYY(dd: string, mm: string, yyyy: string): string {
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
}

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<article\s[^>]*data-ikiss-mfid="11\.2967\.)/).filter((b) => /data-ikiss-mfid="11\.2967\./.test(b));
  for (const block of blocks) {
    const mfidMatch = block.match(/data-ikiss-mfid="11\.2967\.(\d+)\.1"/);
    if (!mfidMatch) continue;
    const eventId = mfidMatch[1]!;
    const id = `oranienburg-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const hrefMatch = block.match(/<h4\s+class="liste-titel"><a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const title = decodeHtmlEntities((hrefMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/<small\s+class="date">(\d{2})\.(\d{2})\.(\d{4})(?:\s+bis\s+(\d{2})\.(\d{2})\.(\d{4}))?<\/small>/);
    if (!dateMatch) continue;
    const startDate = parseDDMMYYYY(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!);
    const endDate = dateMatch[4] ? parseDDMMYYYY(dateMatch[4], dateMatch[5]!, dateMatch[6]!) : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, startDate, ...(endDate && endDate !== startDate ? { endDate } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// IKISS CMS Bekanntmachungen:
// <li data-ikiss-mfid="6.2967.{ID}.1">
//   <small>...Datum: DD.MM.YYYY...</small>
//   <a href="/output/download.php?fid=2967.{ID}.1..PDF">Title</a>
// </li>

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<li\s+data-ikiss-mfid="6\.2967\.(\d+)\.1"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const noticeId = m[1]!;
    const id = `oranienburg-notice-${noticeId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const block = m[2]!;
    const dateMatch = block.match(/(\d{2})\.(\d{2})\.(\d{4})<\/small>/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const title = decodeHtmlEntities((linkMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

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

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/Rathaus-Service/Aktuelles/", "/Stadtleben/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NOTICES_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
console.log(`events:  ${mergedEvents.length} Einträge → ${eventsPath}`);

const noticesPath = join(DIR, "notices.json");
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));
console.log(`notices: ${mergedNotices.length} Einträge → ${noticesPath}`);
