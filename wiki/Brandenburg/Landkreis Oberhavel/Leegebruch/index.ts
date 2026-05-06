#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.leegebruch.de";
const NEWS_URL = `${BASE_URL}/news/index.php`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
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
// PortUNA news archive: <h5>DD.MM.YYYY</h5>
//   <ul><li><a href="/news/1/ID/cat/slug.html">Title</a></li></ul>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const dateRx = /<h5>(\d{2})\.(\d{2})\.(\d{4})<\/h5>([\s\S]*?)(?=<h5>|$)/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dateRx.exec(html)) !== null) {
    const publishedAt = `${dm[3]}-${dm[2]}-${dm[1]}T00:00:00.000Z`;
    const block = dm[4] ?? "";

    const linkRx = /<a\s+href="(\/news\/\d+\/(\d+)\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRx.exec(block)) !== null) {
      const href = lm[1]!;
      const newsId = lm[2]!;
      const id = `leegebruch-news-${newsId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const title = decodeHtmlEntities((lm[3] ?? "").replace(/<[^>]+>/g, "").trim());
      if (!title) continue;
      items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now, updatedAt: now });
    }
  }

  return items.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA tab_link_entry: <li class="tab_link_entry">
//   <p><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">Title</a></p>
//   <p class="tiny_p">DD.MM.YYYY - <time>HH:MM</time> Uhr</p>
//   <p><span>Location</span></p>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li[^>]*class="[^"]*tab_link_entry)/)
    .filter((b) => /class="[^"]*tab_link_entry/.test(b));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const eventId = linkMatch[2]!;
    const startDate = `${linkMatch[3]}-${linkMatch[4]}-${linkMatch[5]}T00:00:00.000Z`;

    const titleMatch = block.match(/class="[^"]*tab_link_title[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const locMatch = block.match(/class="[^"]*tab_link_mandat[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/i);
    const location = locMatch ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) : undefined;

    events.push({ id: `leegebruch-event-${eventId}`, title, url: `${BASE_URL}${href}`, startDate, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

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

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
if (mergedEvents.length > 0)
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events: ${mergedEvents.length} Einträge`);
