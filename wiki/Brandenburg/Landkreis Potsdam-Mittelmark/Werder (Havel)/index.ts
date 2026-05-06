#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.werder-havel.de";
const NEWS_URL = `${BASE_URL}/politik-rathaus/aktuelles/neuigkeiten.html`;
const EVENTS_URL = `${BASE_URL}/tourismus/veranstaltungen/veranstaltungskalender.html`;
const AMTSBLATT_URL = `${BASE_URL}/service/ortsrecht-werder/amtsblatt.html`;
const NOTICES_URL = `${BASE_URL}/service/ortsrecht-werder/bekanntmachungen.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

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

function parseGermanShortDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// Joomla news: <span class="date">DD.MM.YYYY</span>
//              <h4>Title</h4>
//              <a href="/politik-rathaus/aktuelles/neuigkeiten/CAT-ID-name/POST-ID-slug.html">
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="(\/politik-rathaus\/aktuelles\/neuigkeiten\/[^/]+-[^/]+\/(\d+)-[^"]+\.html)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const postId = m[2]!;
    if (seen.has(postId)) continue;
    seen.add(postId);

    // Title and date come AFTER the href in the same <a> block
    const context = html.slice(m.index, m.index + 600);
    const titleMatch = context.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = context.match(/<h5>[^|<]+\|\s*(\d{2}\.\d{2}\.\d{4})<\/h5>/i)
      ?? context.match(/<span[^>]*class="date"[^>]*>(\d{2}\.\d{2}\.\d{4})<\/span>/i);
    const publishedAt = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;

    items.push({ id: `werder-havel-news-${postId}`, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rx = /href="[^"]*veranstaltungskalender\.html\?eventid=(\d+)"([\s\S]{0,2000}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const eventId = m[1]!;
    if (seen.has(eventId)) continue;
    const body = m[2] ?? "";
    const titleMatch = body.match(/<h4[^>]*class="event__title"[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    seen.add(eventId);
    const subheadMatch = body.match(/<p class="subhead">([\s\S]*?)<\/p>/i);
    const subhead = subheadMatch ? (subheadMatch[1] ?? "").replace(/\s+/g, " ").trim() : "";
    const dateMatch = subhead.match(/(\d{2}\.\d{2}\.\d{4})/);
    const startDate = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;
    const timeMatch = subhead.match(/\|\s*(\d{2}:\d{2})/);
    const startDateTime = timeMatch ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`) : startDate;
    const locMatch = body.match(/<div class="event-ort">[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const location = locMatch ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) : undefined;
    const url = `${BASE_URL}/tourismus/veranstaltungen/veranstaltungskalender.html?eventid=${eventId}`;
    events.push({ id: `werder-havel-event-${eventId}`, title, url, startDate: startDateTime, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// Werder (Havel) amtsblatt: static HTML page with PDF links
// <a href="/...amtsblatt...pdf">Amtsblatt Nr. N/YYYY</a> or similar
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Bekanntmachungen: <a href="/media/.../fNNN/title.pdf"><img.../>Title - VÖ: DD.MM.YYYY</a>
  const rx = /href="([^"]*\/f(\d+)\/[^"]+\.pdf[^"]*)"[^>]*>(?:<img[^>]*>\s*)?([\s\S]*?)\s*-\s*V(?:&Ouml;|Ö|O):?\s*(\d{2}\.\d{2}\.\d{4})\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!; const fid = m[2]!;
    const id = `werder-havel-bekanntmachung-${fid}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = decodeHtmlEntities(m[3]!.trim());
    if (!title) continue;
    const dateParts = m[4]!.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)!;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    const pdfUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url: pdfUrl, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Werder (Havel) notices: Joomla com_form2content
// <div class="download"><a href="/media/com_form2content/documents/c29/aNNN/fNNN/filename.pdf">Title - VÖ: DD.MM.YYYY</a></div>
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match: href="/media/com_form2content/.../fNNN/..." then text with "- VÖ: DD.MM.YYYY" or "- V&Ouml;: DD.MM.YYYY"
  const rx = /href="(\/media\/com_form2content\/documents\/[^/]+\/[^/]+\/(f(\d+))\/[^"]+\.pdf[^"]*)"\s[^>]*>(?:<img[^>]*>\s*)?([\s\S]*?)\s*-\s*V(?:&Ouml;|Ö|O):?\s*(\d{2}\.\d{2}\.\d{4})\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const fid = m[3]!;
    const id = `werder-notice-${fid}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities((m[4] ?? "").trim());
    if (!title) continue;

    const dateParts = m[5]!.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)!;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
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
assertAllowed(robots, ["/politik-rathaus/", "/tourismus/", "/service/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
