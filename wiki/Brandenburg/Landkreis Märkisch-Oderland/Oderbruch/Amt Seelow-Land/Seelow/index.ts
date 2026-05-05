#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../../../scripts/robots.ts";

const BASE_URL = "https://www.seelow.de";
const NEWS_URL = `${BASE_URL}/news/1481`;
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

// ── Events ────────────────────────────────────────────────────────────────────

function startDateFromUrl(href: string): string {
  const m = href.match(/\/veranstaltungen\/\d+\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}

function extractEventsFromPage(html: string): Event[] {
  const seen = new Set<string>();
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=class="event-clndr-2-entry")/)
    .filter((b) => b.includes('class="event-clndr-2-entry"'));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    if (seen.has(href)) continue;
    seen.add(href);

    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim())
      : "";
    if (!title) continue;

    const startDate = startDateFromUrl(href);

    // Time from <time>HH:MM</time>
    const times = [...block.matchAll(/<time>(\d{2}:\d{2})<\/time>/g)].map((m) => m[1]);
    const startTime = times[0];
    const endTime = times[1];

    // Adjust startDate to include time if available
    const startIso = startTime
      ? startDate.replace("T00:00:00.000Z", `T${startTime}:00.000Z`)
      : startDate;

    const endDate = endTime
      ? startDate.replace("T00:00:00.000Z", `T${endTime}:00.000Z`)
      : undefined;

    const locMatch = block.match(/class="event-clndr-2-entry-location[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const location = locMatch
      ? decodeHtmlEntities(locMatch[1]!.replace(/<[^>]+>/g, "").trim())
      : undefined;

    events.push({
      id: href.replace(/^\//, "").replace(/\//g, "-"),
      title,
      url: `${BASE_URL}${href}`,
      startDate: startIso,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

async function fetchAllEvents(): Promise<Event[]> {
  const allEvents = new Map<string, Event>();
  const now = new Date();

  // Fetch current month + next 11 months
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(yyyy, date.getMonth() + 1, 0).getDate();
    const url = `${BASE_URL}/veranstaltungen/index.php?beginn=${yyyy}-${mm}-01&ende=${yyyy}-${mm}-${lastDay}`;

    const res = await fetch(url, { headers: { "User-Agent": AMTSFEED_UA } });
    if (!res.ok) continue;
    const html = await res.text();
    const events = extractEventsFromPage(html);
    for (const e of events) allEvents.set(e.id, e);

    if (events.length === 0 && i > 2) break; // stop early if no events for 2+ months
  }

  return [...allEvents.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

// ── News ──────────────────────────────────────────────────────────────────────

function parseGermanDate(dateStr: string): string {
  const m = dateStr.trim().match(/(\d{1,2})\.\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (!m) return new Date().toISOString();
  const mm = GERMAN_MONTHS[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=class="[^"]*\bnews-entry-to-limit\b)/)
    .filter((b) => /class="[^"]*\bnews-entry-to-limit\b/.test(b));

  for (const block of blocks) {
    const h3Match = block.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!h3Match) continue;

    const href = h3Match[1]!;
    const title = decodeHtmlEntities((h3Match[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Date: <div class="news-entry-new-3-date"><span ...>Mo, </span>04. Mai 2026</div>
    const dateMatch = block.match(/class="news-entry-new-3-date"[^>]*>([\s\S]*?)<\/div>/i);
    const dateRaw = dateMatch
      ? (dateMatch[1] ?? "").replace(/<[^>]+>/g, "").replace(/\w{2,3},\s*/, "").trim()
      : "";
    const publishedAt = dateRaw ? parseGermanDate(dateRaw) : now;

    const textMatch = block.match(/class="news-entry-new-3-text"[^>]*>([\s\S]*?)<\/div>/i);
    const description = textMatch
      ? decodeHtmlEntities((textMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    const idMatch = href.match(/\/news\/\d+\/(\d+)\//);
    const id = idMatch ? idMatch[1]! : href;

    items.push({
      id,
      title,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      ...(description ? { description } : {}),
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }

  return items;
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
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/", "/news/"]);

const [incomingEvents, newsHtml] = await Promise.all([
  fetchAllEvents(),
  fetch(NEWS_URL, { headers: { "User-Agent": AMTSFEED_UA } }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, incomingEvents);
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
