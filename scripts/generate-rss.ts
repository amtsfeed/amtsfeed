#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EventsFile, NewsFile, AmtsblattFile, Event, NewsItem, AmtsblattItem } from "./types.ts";

const dir = resolve(process.argv[2] ?? ".");

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function eventToItem(event: Event): string {
  const description = event.location
    ? `${event.description ?? ""}\n\nOrt: ${event.location}`.trim()
    : (event.description ?? "");

  return `    <item>
      <title>${escapeXml(event.title)}</title>
      <link>${escapeXml(event.url)}</link>
      <guid isPermaLink="false">${escapeXml(event.id)}</guid>
      <pubDate>${new Date(event.startDate).toUTCString()}</pubDate>
      ${description ? `<description>${escapeXml(description)}</description>` : ""}
    </item>`;
}

function newsToItem(news: NewsItem): string {
  return `    <item>
      <title>${escapeXml(news.title)}</title>
      <link>${escapeXml(news.url)}</link>
      <guid isPermaLink="false">${escapeXml(news.id)}</guid>
      <pubDate>${new Date(news.publishedAt ?? news.fetchedAt).toUTCString()}</pubDate>
      ${news.description ? `<description>${escapeXml(news.description)}</description>` : ""}
    </item>`;
}

function amtsblattToItem(a: AmtsblattItem): string {
  return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(a.url)}</link>
      <guid isPermaLink="false">${escapeXml(a.id)}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <category>Amtsblatt</category>
    </item>`;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const eventsFile = readJson<EventsFile>(join(dir, "events.json"));
const newsFile = readJson<NewsFile>(join(dir, "news.json"));
const amtsblattFile = readJson<AmtsblattFile>(join(dir, "amtsblatt.json"));

const allItems: string[] = [];

if (eventsFile) {
  const sorted = [...eventsFile.items].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  allItems.push(...sorted.map(eventToItem));
}

if (newsFile) {
  const sorted = [...newsFile.items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  allItems.push(...sorted.map(newsToItem));
}

if (amtsblattFile) {
  const sorted = [...amtsblattFile.items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  allItems.push(...sorted.map(amtsblattToItem));
}

const channelTitle = escapeXml(dir.split("/").at(-1) ?? "amtsfeed");
const buildDate = new Date().toUTCString();

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${channelTitle}</title>
    <link>https://amtsfeed.de</link>
    <description>Amtliche Informationen für ${channelTitle}</description>
    <language>de</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
${allItems.join("\n")}
  </channel>
</rss>
`;

const outPath = join(dir, "rss.xml");
writeFileSync(outPath, rss, "utf-8");
console.log(`Wrote ${allItems.length} items to ${outPath}`);
