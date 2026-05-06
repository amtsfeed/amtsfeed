#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://velten.de";
const NEWS_URL = `${BASE_URL}/Verwaltung-Politik/Aktuelles/Nachrichten/`;
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

// IKISS CMS news list:
// <ul class="result-list"><li>
//   <a href="/Verwaltung-Politik/Aktuelles/Nachrichten/Slug.php?...&FID=3631.NNNN.1&..." data-ikiss-mfid="7.3631.NNNN.1">
//   <small>...<span class="sr-only">Datum: </span>DD.MM.YYYY</small>
//   <h3 class="list-title">Title</h3>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*>)/).filter((b) => /data-ikiss-mfid="7\.3631\./.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="([^"]+)"[^>]*data-ikiss-mfid="7\.3631\.(\d+)\.1"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const newsId = hrefMatch[2]!;
    const id = `velten-news-${newsId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h3\s+class="list-title">([\s\S]*?)<\/h3>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/Datum:\s*<\/span>(\d{2})\.(\d{2})\.(\d{4})/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
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
assertAllowed(robots, ["/Verwaltung-Politik/Aktuelles/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const newsHtml = await fetch(NEWS_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`);
  return r.text();
});

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news: ${mergedNews.length} Einträge → ${newsPath}`);
