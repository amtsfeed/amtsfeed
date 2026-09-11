#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

// werder-havel.de ist 2026 von Joomla auf WordPress umgezogen. Alle alten Pfade
// (/politik-rathaus/aktuelles/neuigkeiten.html, /service/ortsrecht-werder/…) sind weg.
//
// Die WP-REST-API wird bewusst NICHT genutzt: robots.txt sperrt mit "Disallow: /*?*"
// sämtliche URLs mit Query-String, also auch /wp-json/…?per_page=… — deshalb werden die
// query-freien Übersichtsseiten geparst.
//
// Ein eigenes Amtsblatt gibt es auf der neuen Seite nicht mehr; die früher unter
// amtsblatt.json gesammelten PDFs waren Bekanntmachungen. amtsblatt.json bleibt als
// Archiv bestehen, wird aber nicht mehr fortgeschrieben.
const BASE_URL = "https://www.werder-havel.de";
// Die Kategorieseite zeigt nur 6 Beiträge; drei Seiten decken auch mehrtägige Ausfälle ab.
const NEWS_URLS = [1, 2, 3].map((page) => (page === 1 ? `${BASE_URL}/category/neuigkeiten/` : `${BASE_URL}/category/neuigkeiten/page/${page}/`));
const EVENTS_URL = `${BASE_URL}/freizeit-tourismus/event-kalender/`;
const NOTICES_URL = `${BASE_URL}/politik-rathaus/stadtverwaltung/bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const MONTHS: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&ndash;/g, "–")
    .replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&#8203;/g, "").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseGermanShortDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// "10. September 2026" → ISO
function parseGermanLongDate(dateStr: string): string | null {
  const m = dateStr.trim().match(/^(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
}

// WordPress (Divi): <article id="post-282995" …> <h2 class="entry-title"><a href="…">Titel</a></h2>
//                   <p class="post-meta"><span class="published">10. September 2026</span>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<article[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const postId = m[1]!;
    if (seen.has(postId)) continue;
    const body = m[2] ?? "";

    const titleMatch = body.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const url = titleMatch[1]!;
    const title = decodeHtmlEntities(stripHtml(titleMatch[2] ?? ""));
    if (!title) continue;
    seen.add(postId);

    const dateMatch = body.match(/<span[^>]*class="published"[^>]*>([\s\S]*?)<\/span>/i);
    const publishedAt = (dateMatch && parseGermanLongDate(decodeHtmlEntities(stripHtml(dateMatch[1] ?? "")))) || now;

    items.push({ id: `werder-havel-news-${postId}`, title, url, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// Veranstaltungskalender: Markup wie vor dem Relaunch, nur unter neuem Pfad.
// <a href="/freizeit-tourismus/…/veranstaltungsinformationen/?eventid=99113834" …>
//   <p class="subhead">19.09.2026 | 19:00</p> <h4 class="event__title">…</h4>
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="([^"]*veranstaltungsinformationen\/\?eventid=(\d+))"([\s\S]{0,2000}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const eventId = m[2]!;
    if (seen.has(eventId)) continue;
    const body = m[3] ?? "";

    const titleMatch = body.match(/<h4[^>]*class="event__title"[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(stripHtml(titleMatch[1] ?? ""));
    if (!title) continue;
    seen.add(eventId);

    const subheadMatch = body.match(/<p class="subhead">([\s\S]*?)<\/p>/i);
    const subhead = subheadMatch ? (subheadMatch[1] ?? "").replace(/\s+/g, " ").trim() : "";
    const dateMatch = subhead.match(/(\d{2}\.\d{2}\.\d{4})/);
    const startDate = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;
    const timeMatch = subhead.match(/\|\s*(\d{2}:\d{2})/);
    const startDateTime = timeMatch ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`) : startDate;

    const locMatch = body.match(/<div class="event-ort">[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const location = locMatch ? decodeHtmlEntities(stripHtml(locMatch[1] ?? "")) : undefined;

    const url = new URL(m[1]!, BASE_URL).toString();
    events.push({ id: `werder-havel-event-${eventId}`, title, url, startDate: startDateTime, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// Bekanntmachungen (WP File Download):
// <div class="file pdf" … data-id="282973"> … <span class="f_title">Titel</span> …
// <div class="file-dated"><span>Datum hinzugefügt:</span> 09.09.2026</div>
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<div[^>]*class="file [^"]*"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="file [^"]*"[^>]*data-id=|<\/div>\s*<\/div>\s*<\/div>)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const fileId = m[1]!;
    if (seen.has(fileId)) continue;
    const body = m[2] ?? "";

    const titleMatch = body.match(/<span class="f_title">([\s\S]*?)<\/span>/i);
    const linkMatch = body.match(/href="([^"]+\.pdf)"/i);
    if (!titleMatch || !linkMatch) continue;
    const title = decodeHtmlEntities(stripHtml(titleMatch[1] ?? ""));
    if (!title) continue;
    seen.add(fileId);

    const dateMatch = body.match(/class="file-dated"[\s\S]*?(\d{2}\.\d{2}\.\d{4})/i);
    const publishedAt = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;

    items.push({ id: `werder-notice-${fileId}`, title, url: new URL(linkMatch[1]!, BASE_URL).toString(), publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    const old = byId.get(n.id);
    byId.set(n.id, old ? { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt } : n);
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/category/neuigkeiten/", "/freizeit-tourismus/event-kalender/", "/politik-rathaus/stadtverwaltung/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsPages, eventsHtml, noticesHtml] = await Promise.all([
  Promise.all(NEWS_URLS.map((url) => fetch(url, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); }))),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NOTICES_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, newsPages.flatMap(extractNews));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:     ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:   ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`notices:  ${mergedNotices.length} Einträge → ${noticesPath}`);
