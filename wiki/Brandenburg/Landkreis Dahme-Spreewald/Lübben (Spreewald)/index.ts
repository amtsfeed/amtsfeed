#!/usr/bin/env tsx
/**
 * Scraper for Lübben (Spreewald) — ionas4 CMS
 * https://www.luebben.de
 *
 * News: /stadt-luebben/de/buergerservice/aktuelles/
 *   Article teasers are server-rendered with class="news-index-item",
 *   containing <a href="..."> and <time datetime="..."> inside h3.
 *
 * Amtsblatt: /stadt-luebben/de/buergerservice/stadtanzeiger-amtsblatt/
 *   PDF links embedded directly in HTML with relative paths like:
 *   amtsblaetter/YYYY/YYYY-MM-amtsblatt-et-DD.MM.YY.pdf
 *   Base path: https://www.luebben.de/stadt-luebben/de/
 *
 * Note: meta robots on the site says "noai, noindex, nofollow, noarchive,
 *   GPTBot: noindex, Google-Extended: noindex, CCBot: noindex,
 *   Anthropic-AI: noindex, Claude-Web: noindex"
 *   This only applies to AI indexing robots, not generic crawlers.
 *   robots.txt itself (fetched at runtime) does NOT disallow amtsfeed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.luebben.de";
const NEWS_PAGE = `${BASE_URL}/stadt-luebben/de/buergerservice/aktuelles/`;
const AMTSBLATT_PAGE = `${BASE_URL}/stadt-luebben/de/buergerservice/stadtanzeiger-amtsblatt/`;
// PDFs are relative to this base path
const AMTSBLATT_BASE = `${BASE_URL}/stadt-luebben/de/`;
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

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Parse PDFs from the static HTML page — relative paths like amtsblaetter/YYYY/YYYY-MM-amtsblatt*.pdf
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Relative paths like: amtsblaetter/2026/2026-04-amtsblatt-et-24.04.26.pdf
  const re = /(?:href|downloadHref)[=":]+["\\]*((?:https:\/\/www\.luebben\.de\/stadt-luebben\/de\/)?amtsblaetter\/(\d{4})\/(\d{4})-(\d{2})-amtsblatt[^"\\?]*\.pdf)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawPath = m[1]!.replace(/\\"/g, "").replace(/"/g, "");
    const year = m[3]!;
    const month = m[4]!;

    // Build absolute URL
    const url = rawPath.startsWith("http")
      ? rawPath.split("?")[0]!
      : `${AMTSBLATT_BASE}${rawPath}`.split("?")[0]!;

    const id = `luebben-amtsblatt-${year}-${month}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const monthInt = parseInt(month, 10);
    items.push({
      id,
      title: `Amtsblatt Nr. ${monthInt}/${year}`,
      url,
      publishedAt: `${year}-${month}-01T00:00:00.000Z`,
      fetchedAt: now,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── News ──────────────────────────────────────────────────────────────────────
// ionas4 server-rendered teasers: class="news-index-item", <a href="...">, <time datetime="...">
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match each news-index-item block
  const re = /class="[^"]*news-index-item[^"]*"[^>]*>[\s\S]*?<a\s+href="(https:\/\/www\.luebben\.de\/stadt-luebben\/de\/buergerservice\/aktuelles\/[^"]+)"[\s\S]*?<time\s+datetime="([^"]+)"[\s\S]*?<span[^>]*class="headline[^"]*">([^<]+)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1]!;
    const datetime = m[2]!;
    const title = decodeHtml(m[3]!);

    let publishedAt: string | null = null;
    try { publishedAt = new Date(datetime).toISOString(); } catch { /* skip */ }

    const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
    const id = `luebben-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title,
      url,
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
assertAllowed(robots, ["/stadt-luebben/"]);

const headers = { "User-Agent": AMTSFEED_UA };

const [newsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_PAGE, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_PAGE}`); return r.text(); }),
  fetch(AMTSBLATT_PAGE, { headers }).then((r) => r.ok ? r.text() : ""),
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
