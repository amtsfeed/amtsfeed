#!/usr/bin/env tsx
/**
 * Scraper for Zeuthen — maXvis v4 CMS
 * https://www.zeuthen.de
 *
 * News: /meldungen page → news items loaded via AJAX (containercontrols).
 *   Fallback: homepage (/) shows 3 recent news items with dates embedded in HTML.
 *   Sitemap has news article URLs with lastmod dates.
 *   Individual article pages have class="artdate" with the date.
 *
 * Amtsblatt: /amtsblatt → PDFs with pattern Amtsblatt-YYYY-MM-NNNNNN.pdf
 *   Also links to "Am Zeuthener See" newspaper PDFs.
 *
 * Strategy:
 *   - Fetch sitemap, find recent article URLs with ID > 700000
 *   - Fetch each article page to get artdate and title (batch, limited to new items)
 *   - Fetch amtsblatt page for PDF links
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.zeuthen.de";
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
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

// ── Sitemap parsing ───────────────────────────────────────────────────────────
// Returns article URLs with IDs >= minId and their lastmod dates
function parseSitemapNewsUrls(xml: string, minId = 700000): Array<{ url: string; lastmod: string }> {
  const items: Array<{ url: string; lastmod: string }> = [];
  const re = /<url><loc>([^<]+)<\/loc><priority>[^<]+<\/priority><lastmod>([^<]+)<\/lastmod><\/url>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1]!;
    const lastmod = m[2]!;
    // News articles pattern: Title-Words-NNNNNN.html where N is article ID
    const idMatch = url.match(/-(\d{6,7})\.html$/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1]!, 10);
    if (id < minId) continue;
    // Skip known non-news pages by ID patterns of static pages
    if (id < 617780 || (id >= 617800 && id < 617900 && id !== 617885) ) continue;
    items.push({ url, lastmod });
  }
  return items;
}

// ── Fetch article details ─────────────────────────────────────────────────────
interface ArticleInfo { title: string; publishedAt: string | null; isNews: boolean }

async function fetchArticleInfo(url: string, headers: Record<string, string>): Promise<ArticleInfo | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();

    // Check for artdate (news articles)
    const dateMatch = html.match(/class="artdate">([^<]+)/);
    const h2Match = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const isNews = html.includes('t_ris_news') || dateMatch !== null;

    return {
      title: h2Match ? decodeHtml(h2Match[1]!) : url.replace(/.*\/([^/]+)$/, "$1").replace(/-\d+\.html$/, "").replace(/-/g, " "),
      publishedAt: dateMatch ? parseGermanDate(dateMatch[1]!) : null,
      isNews,
    };
  } catch {
    return null;
  }
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Parse PDFs from amtsblatt page — only Amtsblatt-*.pdf (not Am-Zeuthener-See)
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Pattern: href="Amtsblatt-YYYY-MM-NNNNNN.pdf"
  const re = /href="(Amtsblatt-(\d{4})-(\d{2})-(\d+)\.pdf)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const filename = m[1]!;
    const year = m[2]!;
    const month = m[3]!;
    const artId = m[4]!;
    const url = `${BASE_URL}/${filename}`;
    const id = `zeuthen-amtsblatt-${artId}`;
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
assertAllowed(robots, ["/meldungen", "/amtsblatt", "/sitemap.xml"]);

const headers = { "User-Agent": AMTSFEED_UA };

const [amtsblattHtml, sitemapXml] = await Promise.all([
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetch(SITEMAP_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

// Amtsblatt from HTML
const newAmtsblatt = extractAmtsblatt(amtsblattHtml);

// News: from sitemap
const sitemapUrls = parseSitemapNewsUrls(sitemapXml);
const now = new Date().toISOString();
const existingById = new Map(existingNews.items.map((n) => {
  const idMatch = n.url.match(/-(\d{6,7})\.html$/);
  return idMatch ? [idMatch[1]!, n] : [n.id, n];
}));

// Fetch new articles (not already known)
const newUrls = sitemapUrls.filter((e) => {
  const idMatch = e.url.match(/-(\d{6,7})\.html$/);
  return idMatch && !existingById.has(idMatch[1]!);
});

const BATCH_SIZE = 5;
const fetchedItems: NewsItem[] = [];
for (let i = 0; i < Math.min(newUrls.length, 20); i += BATCH_SIZE) {
  const batch = newUrls.slice(i, i + BATCH_SIZE);
  const results = await Promise.all(
    batch.map(async (entry) => {
      const info = await fetchArticleInfo(entry.url, headers);
      if (!info || !info.isNews) return null;
      const idMatch = entry.url.match(/-(\d{6,7})\.html$/);
      return {
        id: `zeuthen-news-${idMatch?.[1] ?? entry.url.replace(/[^a-z0-9]+/gi, "-").slice(-20)}`,
        title: info.title,
        url: entry.url,
        ...(info.publishedAt ? { publishedAt: info.publishedAt } : {}),
        fetchedAt: now,
        updatedAt: now,
      } satisfies NewsItem;
    })
  );
  fetchedItems.push(...results.filter((r): r is NewsItem => r !== null));
}

const mergedNews = mergeNews(existingNews.items, fetchedItems);
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, newAmtsblatt);

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
