#!/usr/bin/env tsx
// Finsterwalde uses Advantic/ScreendriverFOUR CMS with ISO-8859-15 encoding
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.finsterwalde.de";
const NEWS_URL = `${BASE_URL}/Politik-Verwaltung/Aktuelles/Nachrichten/`;
const DIR = dirname(fileURLToPath(import.meta.url));

async function fetchDecoded(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  return new TextDecoder("windows-1252").decode(bytes);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  // Each <li> in result-list contains: <a href="...FID=3652.ID.1..." title="..."> ... <time datetime="YYYY-MM-DD ...">
  const rx = /<li>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const block = m[1]!;
    if (!block.includes("FID=3652.")) continue;
    // Extract FID (news item ID)
    const fidMatch = block.match(/FID=3652\.(\d+)\.1/);
    if (!fidMatch) continue;
    const id = fidMatch[1]!;
    // Extract URL from href
    const hrefMatch = block.match(/href="([^"]+FID=3652\.\d+\.[^"]+)"/);
    if (!hrefMatch) continue;
    const url = `${BASE_URL}${hrefMatch[1]!.replace(/&amp;/g, "&")}`;
    // Extract title from <h3 class="list-title"> or title attribute
    const titleMatch = block.match(/class="list-title">\s*([\s\S]*?)\s*<\/h3>/i)
      ?? block.match(/title="([^"]+)"/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    // Extract date from <time datetime="YYYY-MM-DD ...">
    const dateMatch = block.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})/);
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : null;
    items.push({ id, title, url, publishedAt, fetchedAt: now, updatedAt: now });
  }
  return items;
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
assertAllowed(robots, ["/Politik-Verwaltung/Aktuelles/Nachrichten/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const html = await fetchDecoded(NEWS_URL, headers);

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(html));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news: ${mergedNews.length} Einträge → ${newsPath}`);
