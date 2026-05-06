#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.gross-kreutz.de";
const NEWS_URL = `${BASE_URL}/news.html`;
const EVENTS_URL = `${BASE_URL}/gemeinde/aktuelle-veranstaltungen-termine.html`;
const AMTSBLATT_ROOT_CAT = 386;
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

// Date: "DD Month YYYY" or "DD. Month YYYY" (no weekday)
function parseGermanDate(dateStr: string): string {
  const m = dateStr.trim().match(/(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
  if (!m) return new Date().toISOString();
  const mm = GERMAN_MONTHS[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

// Custom CMS: <div class="news-item">
//   <div class="news-date">DD Month YYYY</div>
//   <h3>Title</h3>
//   <a href="/aktuelles/slug.html">weiter...</a>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="news-item">)/).filter((b) => /class="news-item"/.test(b));
  for (const block of blocks) {
    const dateMatch = block.match(/class="news-date"[^>]*>([^<]+)</);
    if (!dateMatch) continue;
    const publishedAt = parseGermanDate(decodeHtmlEntities(dateMatch[1]!));

    const linkMatch = block.match(/href="(\/(?:aktuelles|news)\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const slugMatch = href.match(/\/([^/]+)\.html$/);
    const id = slugMatch ? `gross-kreutz-news-${slugMatch[1]!}` : href;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    items.push({ id, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Custom CMS events: /gemeinde/aktuelle-veranstaltungen-termine/ID-slug.html
// Date shown as "DD Month YYYY" text adjacent to the link
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="(\/gemeinde\/aktuelle-veranstaltungen-termine\/(\d+)-([^"]+)\.html)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const eventId = m[2]!;
    if (seen.has(eventId)) continue;
    seen.add(eventId);

    // Look for date near the link
    const context = html.slice(Math.max(0, m.index - 200), m.index + 200);
    const dateMatch = context.match(/(\d{1,2})\.?\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
    const startDate = dateMatch ? parseGermanDate(dateMatch[0]) : now;

    // Try to find title: link text or slug
    const after = html.slice(m.index, m.index + 300);
    const titleMatch = after.match(/href="[^"]+">([^<]+)<\/a>/);
    const rawSlug = (m[3] ?? "").replace(/-/g, " ").replace(/\d+$/, "").trim();
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1]!.trim())
      : rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);
    if (!title) continue;

    events.push({ id: `gross-kreutz-event-${eventId}`, title, url: `${BASE_URL}${href}`, startDate, fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Joomla com_dropfiles: year subcategories under root cat 386
// File title: "Amtsblatt 2026-01" → publishedAt: 2026-01-01

interface DropfilesCategory { id: number; title: string; }
interface DropfilesFile { id: number; title: string; created_time: string; link: string; }

async function fetchAmtsblatt(headers: Record<string, string>): Promise<AmtsblattItem[]> {
  const now = new Date().toISOString();
  const catsUrl = `${BASE_URL}/index.php?option=com_dropfiles&view=frontcategories&format=json&id=${AMTSBLATT_ROOT_CAT}&top=${AMTSBLATT_ROOT_CAT}`;
  const catsData = await fetch(catsUrl, { headers }).then((r) => r.ok ? r.json() as Promise<{ categories?: DropfilesCategory[] }> : { categories: [] });
  const cats = (catsData.categories ?? [])
    .filter((c) => /^\d{4}$/.test(c.title))
    .sort((a, b) => Number(b.title) - Number(a.title))
    .slice(0, 2);

  const items: AmtsblattItem[] = [];
  for (const cat of cats) {
    const filesUrl = `${BASE_URL}/index.php?option=com_dropfiles&view=frontfiles&format=json&id=${cat.id}`;
    const filesData = await fetch(filesUrl, { headers }).then((r) => r.ok ? r.json() as Promise<{ files?: DropfilesFile[] }> : { files: [] });
    for (const f of filesData.files ?? []) {
      // Title: "Amtsblatt 2026-01" → parse year/month
      const titleMatch = f.title.match(/(\d{4})-(\d{2})/);
      const dateMatch = f.created_time.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const publishedAt = titleMatch
        ? `${titleMatch[1]}-${titleMatch[2]}-01T00:00:00.000Z`
        : dateMatch
          ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`
          : now;
      items.push({
        id: `gross-kreutz-amtsblatt-${f.id}`,
        title: f.title,
        url: f.link,
        publishedAt,
        fetchedAt: now,
      });
    }
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
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
assertAllowed(robots, ["/news", "/gemeinde/", "/aktuelles/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattItems] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetchAmtsblatt(headers),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, amtsblattItems);

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
