#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.rietz-neuendorf.de";
const EVENTS_URL = `${BASE_URL}/Leben-Freizeit/Veranstaltungen/`;
const NEWS_URL = `${BASE_URL}/Verwaltung/Mitteilungen/`;
const AMTSBLATT_URL = `${BASE_URL}/Gemeinde/Amtsblatt/`;
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

async function fetchLatin1(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const buf = await r.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

// ── Events ────────────────────────────────────────────────────────────────────
// Advantic: <li><a href="/Leben-Freizeit/Veranstaltungen/SLUG.php?...FID=...">
//   <h3 class="list-title">TITLE</h3>
//   <time datetime="YYYY-MM-DD HH:MM:SS">

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li[>\s])/)
    .filter((b) => /FID=\d+/.test(b) && /list-title/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*>/);
    if (!linkMatch) continue;
    const href = decodeHtmlEntities(linkMatch[1]!);

    const titleMatch = block.match(/class="list-title">([\s\S]*?)<\/h/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})/);
    const startDate = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : now;

    const fidMatch = href.match(/FID=([\d.]+)/);
    const id = fidMatch ? `rietz-neuendorf-event-${fidMatch[1]!.replace(/\./g, "-")}` : href;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    events.push({
      id,
      title,
      url,
      startDate,
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Advantic: /Verwaltung/Mitteilungen/SLUG.php?...FID=...
//   <h3 class="list-title">TITLE</h3>
//   <time datetime="YYYY-MM-DD">

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li[>\s])/)
    .filter((b) => /FID=\d+/.test(b) && /list-title/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*>/);
    if (!linkMatch) continue;
    const href = decodeHtmlEntities(linkMatch[1]!);

    const titleMatch = block.match(/class="list-title">([\s\S]*?)<\/h/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : now;

    const fidMatch = href.match(/FID=([\d.]+)/);
    const id = fidMatch ? fidMatch[1]! : href;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    items.push({
      id,
      title,
      url,
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Advantic: <a ...>Amtsblatt Nr. NN-YYYY</a>...<span class="sr-only">Datum: </span>DD.MM.YYYY

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li\s[^>]*data-ikiss-mfid)/)
    .filter((b) => /Amtsblatt Nr\./.test(b));

  for (const block of blocks) {
    const numMatch = block.match(/Amtsblatt Nr\.\s*(\d+)-(\d{4})/);
    if (!numMatch) continue;
    const num = numMatch[1]!.padStart(2, "0");
    const year = numMatch[2]!;

    const dateMatch = block.match(/Datum:\s*<\/span>([\d.]+)/);
    if (!dateMatch) continue;
    const dateParts = dateMatch[1]!.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;

    const hrefMatch = block.match(/href="([^"]+)"/);
    const url = hrefMatch
      ? (hrefMatch[1]!.startsWith("http") ? hrefMatch[1]! : `${BASE_URL}${hrefMatch[1]!}`)
      : AMTSBLATT_URL;

    items.push({
      id: `rietz-neuendorf-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url,
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
assertAllowed(robots, ["/Leben-Freizeit/", "/Verwaltung/", "/Gemeinde/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml] = await Promise.all([
  fetchLatin1(EVENTS_URL, headers),
  fetchLatin1(NEWS_URL, headers),
  fetchLatin1(AMTSBLATT_URL, headers).catch(() => ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
