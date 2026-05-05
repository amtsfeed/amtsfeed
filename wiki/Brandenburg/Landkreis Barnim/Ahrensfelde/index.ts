#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.ahrensfelde.de";
const NEWS_URL = `${BASE_URL}/aktuelles-mehr/aktuelle-meldungen/`;
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
// NOLIS CMS nolis-list-item variant
// Container: <div id="nolis-list-item..." class="nolis-list-item ...">
// Date: <p class="nolis-list-date">DD.MM.YYYY</p>
// Title+URL: <h4 ...><a href="URL">TITLE</a></h4>
// ID: numeric part from URL pattern (\d{6,})-30601

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split('class="nolis-list-item ').filter((b) =>
    b.includes("nolis-list-date")
  );

  for (const block of blocks) {
    const dateMatch = block.match(/<p class="nolis-list-date">(\d{2})\.(\d{2})\.(\d{4})<\/p>/);
    const titleMatch = block.match(/<h4[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = titleMatch[1]!.startsWith("http") ? titleMatch[1]! : `${BASE_URL}${titleMatch[1]!}`;
    const title = decodeHtmlEntities(titleMatch[2]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = url.match(/(\d{6,})-30601/);
    const id = idMatch ? `ahrensfelde-${idMatch[1]!}` : url;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (dateMatch) {
      const [, dd, mm, yyyy] = dateMatch;
      publishedAt = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
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
assertAllowed(robots, ["/aktuelles-mehr/aktuelle-meldungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const newsHtml = await fetch(NEWS_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`);
  return r.text();
});

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));

const now = new Date().toISOString();
// Write empty events file (no events page available)
if (!existsSync(eventsPath)) {
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: [] } satisfies EventsFile, null, 2));
}
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews } satisfies NewsFile, null, 2));

console.log(`events: 0 Einträge (kein Events-Feed verfügbar) → ${eventsPath}`);
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);
