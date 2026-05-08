#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.uebigau-wahrenbrueck.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// PortUNA event-entry-new-1 layout: split on the outer container div
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  // The outer container has "event-entry-new-1" in class (may have extra classes)
  const blocks = html.split(/(?=event-entry-new-1[\s"'])/).filter((b) => b.includes("event-entry-new-1-headline"));
  const seen = new Set<string>();
  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"/);
    if (!linkMatch) continue;
    const id = linkMatch[2]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const isoDate = `${linkMatch[3]}-${linkMatch[4]}-${linkMatch[5]}`;
    const url = `${BASE_URL}${linkMatch[1]}`;
    const titleMatch = block.match(/class="event-entry-new-1-headline[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const timeMatch = block.match(/class="event-entry-new-1-daytime"[^>]*>([\s\S]*?)<\/div>/i);
    let startDate = `${isoDate}T00:00:00.000Z`;
    if (timeMatch) {
      const timeStr = (timeMatch[1] ?? "").replace(/<[^>]+>/g, "").trim();
      const t = timeStr.match(/(\d{2}):(\d{2})/);
      if (t) startDate = `${isoDate}T${t[1]}:${t[2]}:00.000Z`;
    }
    events.push({ id, title, url, startDate, fetchedAt: now, updatedAt: now });
  }
  return events;
}

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit)/).filter((b) => b.includes('class="news-entry-to-limit'));
  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const idMatch = href.match(/\/news\/\d+\/(\d+)\//);
    const id = idMatch ? idMatch[1]! : href;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const vorschauMatch = block.match(/<p\s+class="vorschau_text">([\s\S]*?)<\/p>/i);
    let publishedAt: string | null = null;
    let description: string | undefined;
    if (vorschauMatch) {
      const text = decodeHtmlEntities((vorschauMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
      const dateMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4}):\s*/);
      if (dateMatch) {
        publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
        description = text.slice(dateMatch[0].length).trim() || undefined;
      } else {
        description = text || undefined;
      }
    }
    items.push({ id, title, url, ...(description ? { description } : {}), fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items;
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
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/index.php", "/news/1"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
