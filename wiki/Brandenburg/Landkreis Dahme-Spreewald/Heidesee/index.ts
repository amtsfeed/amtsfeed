#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://gemeinde-heidesee.de";
const NEWS_RSS_URL = `${BASE_URL}/allgemeine-informationen/aktuelles?format=feed&type=rss`;
const EVENTS_URL = `${BASE_URL}/freizeit-und-tourismus-main/veranstaltungen-main`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News (parsed from Joomla RSS feed) ────────────────────────────────────────

function extractNewsFromRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const itemRx = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1]!;
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    if (!titleMatch || !linkMatch) continue;

    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    const link = (linkMatch[1] ?? "").trim();
    if (!title || !link) continue;

    const slug = link.replace(/\/$/, "").split("/").pop() ?? link;
    const id = `heidesee-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubMatch) {
      const d = new Date(pubMatch[1]!.trim());
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    let description: string | undefined;
    if (descMatch) {
      const text = decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (text) description = text.slice(0, 500);
    }

    items.push({
      id,
      title,
      url: link,
      ...(description ? { description } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events (poster image filenames) ───────────────────────────────────────────
// The events page only embeds poster images whose filenames encode the date:
// /templates/yootheme/cache/<hash>/YYYYMMDD_TitleWords-<hash>.<ext>
// We use the filename's date + title-words as the event entry.

function titleFromImageStem(stem: string): string {
  // stem like "20260509_Fruehlingsfest_Gussow"
  const parts = stem.split("_").slice(1); // drop date
  if (parts.length === 0) return stem;
  const text = parts.join(" ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  // Restore common German chars from ASCII transliteration where reasonable.
  return text
    .replace(/\bFruehling/g, "Frühling").replace(/\bfruehling/g, "frühling")
    .replace(/\bTroedel/g, "Trödel").replace(/\btroedel/g, "trödel")
    .replace(/\bMaerz\b/g, "März").replace(/\bmaerz\b/g, "märz");
}

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /\/templates\/yootheme\/cache\/[a-f0-9]+\/(\d{8})_([A-Za-z0-9_-]+?)-[a-f0-9]+\.(?:webp|jpe?g|png)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const dateRaw = m[1]!;
    const stemSuffix = m[2]!;
    const yyyy = dateRaw.slice(0, 4);
    const mm = dateRaw.slice(4, 6);
    const dd = dateRaw.slice(6, 8);
    const startDate = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;

    const title = titleFromImageStem(`${dateRaw}_${stemSuffix}`);
    const slug = `${dateRaw}-${stemSuffix.toLowerCase().replace(/_/g, "-")}`.slice(0, 80);
    const id = `heidesee-event-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      title,
      url: EVENTS_URL,
      startDate,
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
assertAllowed(robots, ["/allgemeine-informationen/aktuelles", "/freizeit-und-tourismus-main/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsXml, eventsHtml] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNewsFromRss(newsXml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
