#!/usr/bin/env tsx
/**
 * Scraper for Märkische Heide — JGS Media / ASP.NET CMS
 * https://www.maerkische-heide.de
 *
 * News: /Gemeindeneuigkeiten — listItem divs with onclick URL and (DD.MM.YYYY) in <p> tags.
 *
 * Amtsblatt: Published via external LINUS WITTICH ePaper platform at
 *   https://www.wittich.de/produkte/zeitungen/2676-gemeindejournal-maerkische-heide---amtsblatt-fuer-die-gemeinde-maerkische-heide
 *   No direct PDF links — only ePaper viewer links. Skipping amtsblatt scraping.
 *
 * Bekanntmachungen: None found on the site.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.maerkische-heide.de";
const NEWS_URL = `${BASE_URL}/Gemeindeneuigkeiten`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtml(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Parse German date "DD.MM.YYYY" → ISO
function parseGermanDate(raw: string): string | null {
  const m = raw.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
}

// ── News ──────────────────────────────────────────────────────────────────────
// JGS Media: <div class='listItem' onclick="location.href='/Gemeindeneuigkeiten/...'">\n<h3>Title</h3>\n<p>(DD.MM.YYYY)</p>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match listItem divs with onclick containing /Gemeindeneuigkeiten/
  const re = /class='listItem'\s+onclick="location\.href='(\/Gemeindeneuigkeiten\/[^']+)'"[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<p>\((\d{1,2}\.\d{1,2}\.\d{4})\)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]!;
    const title = decodeHtml(m[2]!);
    const publishedAt = parseGermanDate(m[3]!);

    const slug = href.replace(/^\/Gemeindeneuigkeiten\//, "").replace(/\.html$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80);
    const id = `maerkische-heide-news-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title,
      url: `${BASE_URL}${href}`,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items;
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
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return b.id.localeCompare(a.id);
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/Gemeindeneuigkeiten"]);

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

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
