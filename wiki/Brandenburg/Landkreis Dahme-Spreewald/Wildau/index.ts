#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AmtsblattFile, AmtsblattItem, NewsFile, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.wildau.de";
const NEWS_API = `${BASE_URL}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc`;
const AMTSBLATT_URL = `${BASE_URL}/stadt/rathaus-online/amtsblatt/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtml(str: string): string {
  return str
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’").replace(/&#8218;/g, "‚").replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”").replace(/&#038;/g, "&").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News via wp-json REST API ─────────────────────────────────────────────────

interface WpPost {
  id: number;
  date: string;
  modified: string;
  link: string;
  title: { rendered: string };
  excerpt?: { rendered: string };
}

function wpPostToNewsItem(p: WpPost): NewsItem {
  const now = new Date().toISOString();
  const title = decodeHtml(p.title.rendered.replace(/<[^>]+>/g, "").trim());
  const description = p.excerpt
    ? decodeHtml(p.excerpt.rendered.replace(/<[^>]+>/g, "").trim()).slice(0, 300) || undefined
    : undefined;
  return {
    id: `wildau-news-${p.id}`,
    title,
    url: p.link,
    publishedAt: p.date ? `${p.date.slice(0, 19)}.000Z`.replace(/T.*/, `T${p.date.slice(11, 19)}.000Z`) : now,
    fetchedAt: now,
    updatedAt: now,
    ...(description ? { description } : {}),
  };
}

// ── Amtsblatt via HTML page ───────────────────────────────────────────────────
// Pattern: <a href="...PDF">...</a> with label containing "Ausgabe N vom DD.MM.YYYY"

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match button with PDF link, followed by "Ausgabe N vom DD.MM.YYYY" text inside the button
  const buttonRx = /<a\s+class="gb-button[^>]+href="(https:\/\/www\.wildau\.de\/wp-content\/uploads\/[^"]+\.pdf)"[^>]*>[\s\S]{0,4000}?Ausgabe\s+(\d+)\s+vom\s+(\d{1,2})\.(\d{2})\.(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = buttonRx.exec(html)) !== null) {
    const url = m[1]!;
    const ausgabe = m[2]!.padStart(2, "0");
    const day = m[3]!.padStart(2, "0");
    const month = m[4]!;
    const year = m[5]!;
    const id = `wildau-amtsblatt-${year}-${ausgabe}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Amtsblatt Ausgabe ${ausgabe}/${year}`,
      url,
      publishedAt: `${year}-${month}-${day}T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/wp-json/", "/stadt/rathaus-online/amtsblatt/"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Paginate wp-json news: up to 3 pages of 50
async function fetchAllNews(): Promise<WpPost[]> {
  const posts: WpPost[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `${NEWS_API}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const batch = (await res.json()) as WpPost[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    posts.push(...batch);
    if (batch.length < 50) break;
  }
  return posts;
}

const [wpPosts, amtsblattHtml] = await Promise.all([
  fetchAllNews(),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const incomingNews = wpPosts.map(wpPostToNewsItem);
const mergedNews = mergeNews(existingNews.items, incomingNews);
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
if (mergedAmtsblatt.length > 0)
  writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
