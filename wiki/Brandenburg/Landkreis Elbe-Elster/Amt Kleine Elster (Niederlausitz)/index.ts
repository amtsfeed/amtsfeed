#!/usr/bin/env tsx
// Amt Kleine Elster uses a custom CMS (REDAXO-based)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-kleine-elster.de";
const NEWS_URL = `${BASE_URL}/verwaltung/aktuelles`;
const AMTSBLATT_URL = `${BASE_URL}/verwaltung/amtsblatt`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  // News items: <h3 class="nomargin"><a href="/verwaltung/aktuelles/SLUG"> Title</a></h3>
  // followed by <span class="news-date">DD.MM.YYYY</span>
  const pattern = /<h3[^>]*>\s*<a[^>]*href="(\/verwaltung\/aktuelles\/([^"]+))"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span\s+class="news-date">([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const href = m[1]!;
    const slug = m[2]!;
    const titleRaw = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    const dateRaw = (m[4] ?? "").trim();
    const id = slug;
    const url = `${BASE_URL}${href}`;
    let publishedAt: string | null = null;
    const dateMatch = dateRaw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dateMatch) {
      publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    }
    if (!titleRaw) continue;
    items.push({ id, title: titleRaw, url, publishedAt, fetchedAt: now, updatedAt: now });
  }
  return items;
}

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  // Table format: <tr><td><a href="/media/FILE.pdf">Nr. NUM/YEAR</a></td><td>DD.MM.YYYY</td></tr>
  const rx = /<tr>\s*<td>\s*<a[^>]*href="(\/media\/[^"]+\.pdf)"[^>]*>Nr\.\s*(\d+)\/(\d{4})<\/a>\s*<\/td>\s*<td>(\d{2})\.(\d{2})\.(\d{4})<\/td>/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const num = m[2]!.padStart(2, "0");
    const year = m[3]!;
    const day = m[4]!;
    const month = m[5]!;
    const pubYear = m[6]!;
    const id = `kleine-elster-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const publishedAt = `${pubYear}-${month}-${day}T00:00:00.000Z`;
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: `${BASE_URL}${href}`,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

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

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/verwaltung/aktuelles", "/verwaltung/amtsblatt"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
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

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
