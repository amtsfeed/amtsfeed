#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.beeskow.de";
const EVENTS_JSON_URL = `${BASE_URL}/kalender/veranstaltungskalender/events.json?weekends=false&tagMode=ALL`;
const EVENTS_URL = `${BASE_URL}/beeskow-erleben/veranstaltungen/`;
const NEWS_URL = `${BASE_URL}/aktuelles`;
const AMTSBLATT_URL = `${BASE_URL}/rathaus/aktuelles/amtsblaetter/`;
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

// ── Events ────────────────────────────────────────────────────────────────────
// ionas4 JSON API: /kalender/veranstaltungskalender/events.json
// Each entry: { id, start: "YYYY-MM-DDTHH:MM", end, allDay, title, website, location? }

interface BeeskowEvent {
  id: string;
  start: string;
  end?: string;
  allDay: boolean;
  title: string;
  website?: string;
  location?: { name?: string };
}

function toIso(dt: string, allDay: boolean): string {
  if (allDay) return `${dt.slice(0, 10)}T00:00:00.000Z`;
  // dt may be "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"
  if (dt.length === 16) return `${dt}:00.000Z`;
  if (dt.length === 19) return `${dt}.000Z`;
  return `${dt.slice(0, 16)}:00.000Z`;
}

function extractEvents(json: BeeskowEvent[]): Event[] {
  const now = new Date().toISOString();
  return json.map((e) => {
    const startDate = toIso(e.start, e.allDay);
    const endDate = e.end ? toIso(e.end, e.allDay) : undefined;
    const location = e.location?.name?.trim() || undefined;
    const url = e.website?.trim() ? e.website.trim() : EVENTS_URL;
    return {
      id: `beeskow-event-${e.id}`,
      title: decodeHtmlEntities(e.title),
      url,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    } satisfies Event;
  });
}

// ── News ──────────────────────────────────────────────────────────────────────
// ionas4: <article class="... news-index-item ... date-TIMESTAMP" data-date="TIMESTAMP">
//   <a href="URL"><h2...><time datetime="YYYY-MM-DDTHH:MM:SS+TZ"><span class="headline">Title</span></h2></a>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<article\s[^>]*\bnews-index-item\b)/)
    .filter((b) => /\bnews-index-item\b/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+href="(https?:\/\/www\.beeskow\.de[^"]+)"/);
    if (!linkMatch) continue;
    const url = linkMatch[1]!;

    const titleMatch = block.match(/<span\s+class="headline">([\s\S]*?)<\/span>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/<time\s[^>]*datetime="(\d{4}-\d{2}-\d{2})/);
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : now;

    const idMatch = url.match(/\/(\d{4})\/[^/]+\/?$/);
    const id = idMatch ? idMatch[1]! : url;

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
// ionas4: HTML-entity-encoded JSON: fileCreated="DD.MM.YYYY..." fileName="Amtsblatt Nr. N.YYYY.pdf"

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /fileCreated&quot;:&quot;(\d{2})\.(\d{2})\.(\d{4})[^&]*&quot;.*?fileName&quot;:&quot;Amtsblatt Nr\. (\d+)\.(\d{4})\.pdf&quot;/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const day = m[1]!;
    const month = m[2]!;
    const year = m[3]!;
    const num = m[4]!.padStart(2, "0");
    const issueYear = m[5]!;
    const publishedAt = `${year}-${month}-${day}T00:00:00.000Z`;
    items.push({
      id: `beeskow-amtsblatt-${issueYear}-${num}`,
      title: `Amtsblatt Nr. ${num}/${issueYear}`,
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
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/kalender/", "/aktuelles", "/rathaus/aktuelles/amtsblaetter/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsJson, newsHtml, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_JSON_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_JSON_URL}`); return r.json() as Promise<BeeskowEvent[]>; }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsJson));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
