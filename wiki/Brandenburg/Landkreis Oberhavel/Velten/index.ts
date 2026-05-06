#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://velten.de";
const NEWS_URL = `${BASE_URL}/Verwaltung-Politik/Aktuelles/Nachrichten/`;
const EVENTS_URL = `${BASE_URL}/Verwaltung-Politik/Aktuelles/Veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/Verwaltung-Politik/Aktuelles/Amtsblatt/`;
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
// <ul class="result-list"><li>
//   <a href="/Verwaltung-Politik/Aktuelles/Nachrichten/..." data-ikiss-mfid="7.3631.NNNN.1">
//   <small>...<span class="sr-only">Datum: </span>DD.MM.YYYY</small>
//   <h3 class="list-title">Title</h3>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*>)/).filter((b) => /data-ikiss-mfid="7\.3631\./.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="([^"]+)"[^>]*data-ikiss-mfid="7\.3631\.(\d+)\.1"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const newsId = hrefMatch[2]!;
    const id = `velten-news-${newsId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h3\s+class="list-title">([\s\S]*?)<\/h3>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/Datum:\s*<\/span>(\d{2})\.(\d{2})\.(\d{4})/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// IKISS CMS events list:
// <li>
//   <a href="/Verwaltung-Politik/Aktuelles/Veranstaltungen/..." data-ikiss-mfid="11.3631.NNNN.1">
//   <small>...<span class="sr-only">Datum: </span>DD.MM.YYYY[ bis DD.MM.YYYY]</small>
//   <h3 class="list-title">Title</h3>

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*>)/).filter((b) => /data-ikiss-mfid="11\.3631\./.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="([^"]+)"[^>]*data-ikiss-mfid="11\.3631\.(\d+)\.1"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const eventId = hrefMatch[2]!;
    const id = `velten-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h3\s+class="list-title">([\s\S]*?)<\/h3>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateText = block.match(/Datum:\s*<\/span>([\s\S]{0,60}?)(?:<\/small>|<br)/)?.[1] ?? "";
    const dates = [...dateText.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
    if (dates.length === 0) continue;
    const startDate = `${dates[0]![3]}-${dates[0]![2]}-${dates[0]![1]}T00:00:00.000Z`;
    const endDate = dates.length > 1 ? `${dates[1]![3]}-${dates[1]![2]}-${dates[1]![1]}T00:00:00.000Z` : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, startDate, ...(endDate && endDate !== startDate ? { endDate } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// IKISS CMS amtsblatt:
// <li><a href="/output/download.php?fid=3631.NNNN.1.PDF" class="csslink_PDF">Amtsblatt Nr. N - Herausgabe: DD.MM.YYYY</a></li>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s[^>]*href="(\/output\/download\.php\?fid=3631\.(\d+)\.1\.PDF[^"]*)"[^>]*class="csslink_PDF[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const itemId = m[2]!;
    const id = `velten-amtsblatt-${itemId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const linkText = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!linkText.includes("Amtsblatt")) continue;

    const dateMatch = linkText.match(/Herausgabe:\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const url = `${BASE_URL}${href}`;
    items.push({ id, title: linkText, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/Verwaltung-Politik/Aktuelles/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);

const amtsblattPath = join(DIR, "amtsblatt.json");
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
