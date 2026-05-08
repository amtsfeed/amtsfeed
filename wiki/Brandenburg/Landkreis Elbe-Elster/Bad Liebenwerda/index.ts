#!/usr/bin/env tsx
// Note: www.bad-liebenwerda.de is the tourist information website for Bad Liebenwerda,
// not the official city hall site. No separate municipal site was found.
// This scraper covers local news from the tourist information portal.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.bad-liebenwerda.de";
// Category 3 = "Aktuell"
const NEWS_API = `${BASE_URL}/wp-json/wp/v2/posts?per_page=50&categories=3&_fields=id,date,title,link`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
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
assertAllowed(robots, ["/wp-json/wp/v2/posts"]);

const headers = { "User-Agent": AMTSFEED_UA };
const now = new Date().toISOString();

const postsRaw = await fetch(NEWS_API, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_API}`);
  return r.json() as Promise<Record<string, unknown>[]>;
});

const newsItems: NewsItem[] = postsRaw.map((p) => ({
  id: String(p["id"]),
  title: decodeHtmlEntities(String((p["title"] as { rendered?: string })?.rendered ?? "").replace(/<[^>]+>/g, "").trim()),
  url: String(p["link"] ?? ""),
  publishedAt: p["date"] ? `${String(p["date"])}.000Z` : null,
  fetchedAt: now,
  updatedAt: now,
})).filter((n) => n.title && n.url);

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, newsItems);

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news: ${mergedNews.length} Einträge → ${newsPath}`);
