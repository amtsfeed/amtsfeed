#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, EventsFile, Event } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://amt-niemegk.de";
const NEWS_URL = `${BASE_URL}/nachrichten-aus-dem-amtsgebiet/`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/`;
const EVENTS_RSS_URL = `${BASE_URL}/events/feed/`;
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
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanLongDate(str: string): string {
  const m = str.trim().match(/(\d{1,2})\.\s+([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
  if (!m) {
    // try "D. Month YYYY" without dot (e.g. "4. Mai 2026")
    const m2 = str.trim().match(/(\d{1,2})\s+([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
    if (!m2) return new Date().toISOString();
    const mm = GERMAN_MONTHS[m2[2] ?? ""] ?? "01";
    return `${m2[3]}-${mm}-${(m2[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
  }
  const mm = GERMAN_MONTHS[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

// WordPress: <article ...><h2 class="..."><a href="URL">Title</a></h2><time datetime="YYYY-MM-DD">D. Month YYYY</time>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const articleRx = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let article: RegExpExecArray | null;
  while ((article = articleRx.exec(html)) !== null) {
    const body = article[1]!;

    const linkMatch = body.match(/href="(https?:\/\/amt-niemegk\.de\/([^"]+)\/)"/i);
    if (!linkMatch) continue;
    const url = linkMatch[1]!;
    const slug = linkMatch[2]!.replace(/\//g, "-").slice(0, 80);
    const id = `amt-niemegk-news-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = body.match(/<h\d[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const timeMatch = body.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"[^>]*>/i);
    const publishedAt = timeMatch
      ? `${timeMatch[1]}T00:00:00.000Z`
      : (() => {
        const dateText = body.match(/<time[^>]*>([^<]+)<\/time>/i);
        return dateText ? parseGermanLongDate(decodeHtmlEntities(dateText[1]!)) : now;
      })();

    items.push({ id, title, url, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// WordPress: <li class="..."><a href="PDF" download rel="nofollow">YYYY &#8211; NN &#8211; Amtsblatt</a>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();

  const rx = /<li[^>]*>\s*<a href="([^"]+\.pdf[^"]*)"[^>]*>(\d{4})\s*(?:[-\u2013]|&#8211;)\s*(\d{2})\s*(?:[-\u2013]|&#8211;)\s*Amtsblatt<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const pdfUrl = m[1]!.startsWith("http") ? m[1]! : `${BASE_URL}${m[1]!}`;
    const year = m[2]!;
    const num = m[3]!;
    items.push({
      id: `amt-niemegk-amtsblatt-${year}-${num}`,
      title: `Amtsblatt ${year}-${num}`,
      url: pdfUrl,
      publishedAt: `${year}-01-01T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
}

// MEC RSS feed: mec:startDate, mec:startHour, mec:endDate, mec:endHour, mec:location
// guid contains post ID (p=NNNN), link contains ?occurrence=YYYY-MM-DD for recurring events
function extractEventsFromRss(xml: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const block of xml.split("<item>").slice(1)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const guidMatch = block.match(/<guid[^>]*>[\s\S]*?[?&]p=(\d+)/);
    const startDate = block.match(/<mec:startDate>(\d{4}-\d{2}-\d{2})<\/mec:startDate>/)?.[1];
    const startHour = block.match(/<mec:startHour>([\d:]+)<\/mec:startHour>/)?.[1];
    const endDate = block.match(/<mec:endDate>(\d{4}-\d{2}-\d{2})<\/mec:endDate>/)?.[1];
    const endHour = block.match(/<mec:endHour>([\d:]+)<\/mec:endHour>/)?.[1];
    const locationMatch = block.match(/<mec:location>([\s\S]*?)<\/mec:location>/);

    if (!titleMatch || !linkMatch || !startDate) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    const url = linkMatch[1]!.trim();
    const postId = guidMatch?.[1] ?? "";
    const occurrence = url.match(/occurrence=(\d{4}-\d{2}-\d{2})/)?.[1] ?? startDate;

    const id = `amt-niemegk-event-${postId || occurrence}-${occurrence}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const startDateTime = startHour ? `${startDate}T${startHour}:00.000Z` : `${startDate}T00:00:00.000Z`;
    const location = locationMatch ? decodeHtmlEntities(locationMatch[1]!.trim()) : undefined;
    let endDateTime: string | undefined;
    if (endDate) endDateTime = endHour ? `${endDate}T${endHour}:00.000Z` : `${endDate}T00:00:00.000Z`;

    items.push({
      id,
      title,
      url,
      startDate: startDateTime,
      ...(endDateTime ? { endDate: endDateTime } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
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
assertAllowed(robots, ["/nachrichten-aus-dem-amtsgebiet/", "/amtsblatt/", "/events/"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Fetch events RSS pages until empty
async function fetchAllEventPages(): Promise<Event[]> {
  let all: Event[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = page === 1 ? EVENTS_RSS_URL : `${EVENTS_RSS_URL}?paged=${page}`;
    const xml = await fetch(url, { headers }).then((r) => r.ok ? r.text() : "");
    const items = extractEventsFromRss(xml);
    if (items.length === 0) break;
    all = all.concat(items);
  }
  return all;
}

const [newsHtml, amtsblattHtml, incomingEvents] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetchAllEventPages(),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, incomingEvents);

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
