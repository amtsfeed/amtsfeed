#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.werneuchen-barnim.de";
const RSS_URL = `${BASE_URL}/portal/rss.xml`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// NOLIS CMS RSS feed
// Items: <item>...</item>
// Title: <title>TEXT</title>
// URL: <link>URL</link>
// Date: <pubDate>RFC 2822 string</pubDate>
// ID: numeric part from URL pattern (\d{6,})-30690

function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = xml.split("<item>").slice(1); // first part is feed header

  for (const block of blocks) {
    const titleMatch = block.match(/<title>([^<]+)<\/title>/);
    const linkMatch = block.match(/<link>([^<]+)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);

    if (!titleMatch || !linkMatch) continue;

    const url = linkMatch[1]!.trim();
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title || !url) continue;

    const idMatch = url.match(/(\d{6,})-30690/);
    const id = idMatch ? `werneuchen-${idMatch[1]!}` : url;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubDateMatch) {
      try {
        publishedAt = new Date(pubDateMatch[1]!.trim()).toISOString();
      } catch {
        // ignore parse errors
      }
    }

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

const NEWS_LIMIT = 50;

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
  return [...byId.values()]
    .sort((a, b) => {
      if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
      return 0;
    })
    .slice(0, NEWS_LIMIT);
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/portal/rss.xml"]);

const headers = { "User-Agent": AMTSFEED_UA };
const rssXml = await fetch(RSS_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${RSS_URL}`);
  return r.text();
});

const newsPath = join(DIR, "news.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(rssXml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews } satisfies NewsFile, null, 2));

console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
