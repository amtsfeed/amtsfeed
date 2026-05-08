#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.mittenwalde.de";
const NEWS_URL = `${BASE_URL}/de/verwaltung-wirtschaft/aktuelles/aus-der-stadt`;
const EVENTS_URL = `${BASE_URL}/de/service-wie-was-wo/kalender/veranstaltungskalender`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…").replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”").replace(/&ndash;/g, "–").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// TYPO3 tx_news list. Each item:
//   <span class="news-list-date"><time datetime="YYYY-MM-DD">DD.MM.YYYY ...</time></span>
//   <a href="/de/.../einzelansicht/{slug}"> ... <b>Title</b> ... <div itemprop="description">...</div></a>
// Items live inside <div class="row with-keywords ...">.

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="row with-keywords)/).filter((b) => /einzelansicht\//.test(b));
  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/de\/[^"]*\/einzelansicht\/([^"\/]+))"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const slug = linkMatch[2]!;
    const id = `mittenwalde-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const dateMatch = block.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/);
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : undefined;

    const titleMatch = block.match(/<b>([\s\S]*?)<\/b>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const descMatch = block.match(/<div itemprop="description">([\s\S]*?)<\/div>/);
    const description = descMatch
      ? decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    items.push({
      id,
      title,
      url: `${BASE_URL}${href}`,
      ...(description ? { description } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Custom mwwidgets_terminliste. Each event:
//   <div class="termin">
//     <p class="date">DD.MM.YYYY</p>     ← start
//     <p>bis</p>                          (optional)
//     <p class="date">DD.MM.YYYY</p>     ← optional end
//     <p class="time">von HH:MM Uhr</p>
//     <p class="time">bis HH:MM Uhr</p>  (optional)
//     <p><b>Title</b></p>
//     <p class="description">…</p>
// No per-event URL → use page URL with anchor based on slug.

function slugifyTitle(title: string): string {
  return title.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function parseShortDate(d: string): string | undefined {
  const m = d.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="termin">)/).filter((b) => b.includes('class="termin"'));
  for (const block of blocks) {
    const dateMatches = [...block.matchAll(/<p class="date">([^<]*)<\/p>/g)];
    const startRaw = dateMatches[0]?.[1]?.trim();
    if (!startRaw) continue;
    const startDateOnly = parseShortDate(startRaw);
    if (!startDateOnly) continue;
    const endDateOnly = dateMatches[1]?.[1] ? parseShortDate(dateMatches[1][1]) : undefined;

    const timeMatches = [...block.matchAll(/<p class="time">(?:von|bis)\s*(\d{1,2}:\d{2})\s*Uhr<\/p>/g)];
    const startTime = timeMatches[0]?.[1];
    const endTime = timeMatches[1]?.[1];

    const titleMatch = block.match(/<p>\s*<b>([\s\S]*?)<\/b>\s*<\/p>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const descMatch = block.match(/<p class="description">([\s\S]*?)<\/p>/);
    const description = descMatch
      ? decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()) || undefined
      : undefined;

    const startDate = startTime
      ? `${startDateOnly}T${startTime.padStart(5, "0")}:00.000Z`
      : `${startDateOnly}T00:00:00.000Z`;
    const endDate = endDateOnly
      ? (endTime ? `${endDateOnly}T${endTime.padStart(5, "0")}:00.000Z` : `${endDateOnly}T23:59:59.000Z`)
      : (endTime ? `${startDateOnly}T${endTime.padStart(5, "0")}:00.000Z` : undefined);

    const id = `mittenwalde-event-${startDateOnly}-${slugifyTitle(title)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      title,
      url: EVENTS_URL,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }
  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/de/verwaltung-wirtschaft/aktuelles/", "/de/service-wie-was-wo/kalender/"]);

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
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
