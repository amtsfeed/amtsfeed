#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://oranienburg.de";
const NEWS_URL = `${BASE_URL}/Rathaus-Service/Aktuelles/Meldungen/`;
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
// <small class="date">DD.MM.YYYY</small>
// <h4 class="liste-titel"><a href="/...Slug.php?...&FID=2967.NNNN.1&...">Title</a></h4>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<small\s+class="date">(\d{2})\.(\d{2})\.(\d{4})<\/small>[\s\S]{0,400}?<h4\s+class="liste-titel"><a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[4]!;
    const title = decodeHtmlEntities((m[5] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const fidMatch = href.match(/FID=\d+\.(\d+)\.\d+/);
    const id = fidMatch ? `oranienburg-news-${fidMatch[1]!}` : `oranienburg-news-${encodeURIComponent(href).slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now, updatedAt: now });
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
assertAllowed(robots, ["/Rathaus-Service/Aktuelles/"]);

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
