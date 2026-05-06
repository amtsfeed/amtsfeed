#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://beelitz.de";
const NEWS_URL = `${BASE_URL}/category/news/`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// WordPress: <article ...>
//   <h3 class="..."><a href="URL">Title</a></h3>
//   <time class="entry-date" datetime="YYYY-MM-DD">...</time>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const articleRx = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let article: RegExpExecArray | null;
  while ((article = articleRx.exec(html)) !== null) {
    const body = article[1]!;

    const linkMatch = body.match(/href="(https?:\/\/beelitz\.de\/([^"]+)\/)"/i);
    if (!linkMatch) continue;
    const url = linkMatch[1]!;
    // skip category/tag/page URLs
    if (/\/(category|tag|page)\//.test(url)) continue;
    const slug = linkMatch[2]!.replace(/\//g, "-").slice(0, 80);
    const id = `beelitz-news-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = body.match(/<h\d[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const timeMatch = body.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"[^>]*>/i);
    const publishedAt = timeMatch ? `${timeMatch[1]}T00:00:00.000Z` : now;

    items.push({ id, title, url, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// WordPress amtsblatt page: organized under <h2>YEAR</h2> headings
// links: <a href="/wp-content/uploads/.../Beeli####_AMT.pdf">Amtsblatt XX/YYYY</a>
// or: <a href="/dl/BN/Amtsblatt_Beelitz_##-YYYY.pdf">Amtsblatt XX/YYYY</a>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a href="([^"]+\.pdf[^"]*)"[^>]*>Amtsblatt\s*(\d+)\/(\d{4})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const num = m[2]!.padStart(2, "0");
    const year = m[3]!;
    const id = `beelitz-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pdfUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: pdfUrl,
      publishedAt: `${year}-01-01T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.id.localeCompare(a.id));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
}
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/category/", "/amtsblatt/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
