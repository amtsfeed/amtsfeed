#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.schwielowsee.de";
const NEWS_URL = `${BASE_URL}/aktuelles/mitteilungen.html`;
const AMTSBLATT_URL = `${BASE_URL}/buergerservice/amtsblatt.html`;
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

function parseGermanShortDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// ScreendriverFOUR CMS:
// <p><strong>DD.MM.YYYY</strong> | Mitteilungen</p>
// <h2><a href="/aktuelles/mitteilungen/slug.html">Title</a></h2>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // split by <strong>DD.MM.YYYY</strong> date blocks
  const blocks = html.split(/(?=<strong>\d{2}\.\d{2}\.\d{4}<\/strong>)/);
  for (const block of blocks) {
    const dateMatch = block.match(/<strong>(\d{2}\.\d{2}\.\d{4})<\/strong>/);
    if (!dateMatch) continue;
    const publishedAt = parseGermanShortDate(dateMatch[1]!);

    const linkMatch = block.match(/href="(\/aktuelles\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const slugMatch = href.match(/\/([^/]+)\.html$/);
    const id = slugMatch ? `schwielowsee-news-${slugMatch[1]!}` : href;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    items.push({ id, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ScreendriverFOUR amtsblatt:
// <strong>Amtsblatt YYYY/NUMBER</strong> ... vom DD.MM.YYYY ... <a href="/images/downloads/Amtsblatt/YYYY/FILENAME.pdf">
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<strong>Amtsblatt\s+(\d{4})\/(\d+)<\/strong>([\s\S]{0,400}?)href="(\/images\/downloads\/Amtsblatt\/[^"]+\.pdf)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const year = m[1]!;
    const num = m[2]!.padStart(2, "0");
    const id = `schwielowsee-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const between = m[3]!;
    const dateMatch = between.match(/vom\s+(\d{2}\.\d{2}\.\d{4})/);
    const publishedAt = dateMatch ? parseGermanShortDate(dateMatch[1]!) : `${year}-01-01T00:00:00.000Z`;

    items.push({ id, title: `Amtsblatt ${year}/${num}`, url: `${BASE_URL}${m[4]!}`, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
assertAllowed(robots, ["/aktuelles/", "/buergerservice/"]);

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
