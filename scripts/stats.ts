#!/usr/bin/env tsx
/**
 * Usage: pnpm tsx scripts/stats.ts "wiki/Brandenburg/.../Amt Foo"
 * Prints event/news statistics and the last 5 RSS entries for a location folder.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EventsFile, NewsFile } from "./types.ts";

const dir = resolve(process.argv[2] ?? ".");

function load<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const eventsData = load<EventsFile>(join(dir, "events.json"), { updatedAt: "", items: [] });
const newsData = load<NewsFile>(join(dir, "news.json"), { updatedAt: "", items: [] });

const events = eventsData.items;
const news = newsData.items;

const withTime = events.filter((e) => !e.startDate.endsWith("T00:00:00.000Z"));
const withLoc = events.filter((e) => e.location);
const withNewsDate = news.filter((n) => n.publishedAt);

const dates = events.map((e) => e.startDate.slice(0, 10)).sort();
const dateRange = dates.length ? `${dates[0]} – ${dates[dates.length - 1]}` : "–";

console.log(`Events:  ${events.length} total | ${withTime.length} mit Uhrzeit | ${withLoc.length} mit Ort`);
console.log(`         Zeitraum: ${dateRange}`);
console.log(`News:    ${news.length} total | ${withNewsDate.length} mit Datum`);

// Read last 5 items from rss.xml (in document order — last 5 <item> blocks)
const rssPath = join(dir, "rss.xml");
if (existsSync(rssPath)) {
  const rssXml = readFileSync(rssPath, "utf-8");
  const itemMatches = [...rssXml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const items = itemMatches.map((m) => {
    const block = m[1] ?? "";
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? block.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ?? "";
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? "";
    return { title, link, pubDate };
  });

  // Sort all items by pubDate descending, show top 5
  const sorted5 = items
    .filter((i) => i.pubDate && !isNaN(new Date(i.pubDate).getTime()))
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 5);
  console.log(`\nNeuste 5 RSS-Einträge (nach pubDate):`);
  for (const item of sorted5) {
    const dateStr = item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "–";
    console.log(`  [${dateStr}] ${item.title.slice(0, 70)}`);
    console.log(`           ${item.link}`);
  }
} else {
  console.log(`\n(kein rss.xml vorhanden — bitte zuerst generate-rss.ts ausführen)`);
}
