#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://stadt.bad-freienwalde.de";
const NEWS_BASE = `${BASE_URL}/news/index.php?archiv=1&rubrik=1`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/veroeffentlichung/typ/812`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/​/g, "").replace(/&#8203;/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// Verwaltungsportal archive: <h4>DD.MM.YYYY</h4> then <ul><li><a href="/news/1/{ID}/nachrichten/slug.html">

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const dateBlocks = html.split(/<h2\s[^>]*legacy_h5[^>]*>([^<]+)<\/h2>/);
  let currentDate: string | null = null;

  for (let i = 0; i < dateBlocks.length; i++) {
    const chunk = dateBlocks[i]!;
    if (i % 2 === 1) {
      const dateStr = decodeHtmlEntities(chunk).trim();
      const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      currentDate = m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : null;
      continue;
    }
    if (!currentDate) continue;

    const linkRx = /<a\s+href="(\/news\/\d+\/(\d+)\/nachrichten\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRx.exec(chunk)) !== null) {
      const title = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
      if (!title || title === "mehr") continue;
      const id = `bad-freienwalde-news-${m[2]!}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, title, url: `${BASE_URL}${m[1]!}`, publishedAt: currentDate, fetchedAt: now, updatedAt: now });
    }
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Verwaltungsportal: <a href="/veranstaltungen/{ID}/{YYYY}/{MM}/{DD}/slug.html">
// Date extracted from URL path; composite ID for recurring events.

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s+href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const title = decodeHtmlEntities((m[6] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title || title === "mehr") continue;
    const [, href, eventId, yyyy, mm, dd] = m;
    const id = `bad-freienwalde-event-${eventId!}-${yyyy}${mm}${dd}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const startDate = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    items.push({ id, title, url: `${BASE_URL}${href!}`, startDate, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Verwaltungsportal table: <td>Amtsblatt Nr. N</td> <td>DD.MM.YYYY</td>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>Amtsblatt Nr\.\s*(\d+)<\/td>\s*<td>([\d.&#;]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[1]!.padStart(2, "0");
    const dateStr = m[2]!.replace(/&#\d+;/g, "");
    const dateParts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const year = dateParts[3]!;
    const publishedAt = `${year}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    items.push({
      id: `bad-freienwalde-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: AMTSBLATT_URL,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/veroeffentlichung/"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Fetch news with pagination (up to 5 pages via ?bis=YYYY-MM-DD)
async function fetchAllNewsHtml(): Promise<string> {
  let combined = "";
  let url: string | null = NEWS_BASE;
  let pages = 0;
  while (url && pages < 5) {
    const html: string = await fetch(url, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); });
    combined += html;
    const bisMatch = html.match(/href="\/news\/index\.php\?bis=([^"]+)"/);
    url = bisMatch ? `${BASE_URL}/news/index.php?bis=${bisMatch[1]!}&rubrik=1` : null;
    pages++;
  }
  return combined;
}

const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetchAllNewsHtml(),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
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

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
