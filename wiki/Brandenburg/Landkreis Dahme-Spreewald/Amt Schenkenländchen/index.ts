#!/usr/bin/env tsx
/**
 * Scraper for Amt Schenkenländchen (VerwaltungsPortal CMS)
 * https://www.amt-schenkenlaendchen.de
 *
 * News: /news/index.php?rubrik=1  — HTML list with dates
 * Amtsblatt: /amtsblatt/index.php?ebene=28 — HTML table with Nr./date; PDFs served via POST form
 * Bekanntmachungen: /bekanntmachungen/index.php — HTML list
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-schenkenlaendchen.de";
const NEWS_URL = `${BASE_URL}/news/index.php?rubrik=1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php?ebene=28`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtml(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Parse German date "29.&#8203;04.&#8203;2026" or "29. April 2026" → ISO
function parseGermanDate(raw: string): string | null {
  const s = raw.replace(/&#8203;/g, "").trim();
  // DD.MM.YYYY
  const m1 = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m1) {
    const [, d, mo, y] = m1;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}T00:00:00.000Z`;
  }
  return null;
}

function absUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// ── News ──────────────────────────────────────────────────────────────────────
// VerwaltungsPortal news: articles with date span and anchor
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Pattern: news-entry-new-2 blocks with date and link
  const re = /<li[^>]*class="news-entry-to-limit[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const block = m[1]!;
    // Extract href
    const hrefMatch = block.match(/href="(\/news\/[^"]+)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    // Extract title
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]!);
    // Extract date
    const dateMatch = block.match(/news-entry-new-2-date[^>]*>([\s\S]*?)<\/div>/);
    let publishedAt: string | null = null;
    if (dateMatch) {
      // "Mi, 29. April 2026" → strip weekday
      const dateText = dateMatch[1]!.replace(/<[^>]+>/g, "").replace(/&#8203;/g, "").trim();
      publishedAt = parseGermanDate(dateText);
      if (!publishedAt) {
        // Try "DD. Monat YYYY"
        const months: Record<string, string> = {
          januar: "01", februar: "02", "märz": "03", april: "04", mai: "05",
          juni: "06", juli: "07", august: "08", september: "09", oktober: "10",
          november: "11", dezember: "12"
        };
        const mx = dateText.toLowerCase().match(/(\d{1,2})\.\s*(januar|februar|m.rz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/);
        if (mx) {
          const mo = months[mx[2]!.replace(/ä/g, "a").replace(/ö/g, "o")] ?? months[mx[2]!.toLowerCase()];
          if (mo) publishedAt = `${mx[3]}-${mo}-${mx[1]!.padStart(2, "0")}T00:00:00.000Z`;
        }
      }
    }

    const id = `amt-schenkenlaendchen-news-${href.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title,
      url: absUrl(href),
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }
  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Format: <td>Nr. N/YYYY</td><td>DD.MM.YYYY</td><td><form ...gazette_ID...>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Extract rows: Nr.X/YYYY, date, and form with gazette ID
  const rowRe = /<td>(Nr\.\s*[\d]+\/\d{4})<\/td>\s*<td>([\d.&#;]+)<\/td>\s*<td>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const nrText = m[1]!.trim();
    const dateRaw = m[2]!;
    const formBlock = m[3]!;

    const publishedAt = parseGermanDate(decodeHtml(dateRaw));
    if (!publishedAt) continue;

    // Extract gazette ID from form action
    const gazetteMatch = formBlock.match(/gazette_(\d+)/);
    if (!gazetteMatch) continue;
    const gazetteId = gazetteMatch[1]!;

    const id = `amt-schenkenlaendchen-amtsblatt-${gazetteId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt ${nrText}`,
      // PDFs require POST with hash — link to the listing page with anchor
      url: `${AMTSBLATT_URL}#gazette_${gazetteId}`,
      publishedAt,
      fetchedAt: now,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices (Bekanntmachungen) ────────────────────────────────────────────────
// VerwaltungsPortal bekanntmachungen: similar structure to news
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Look for links + dates in bekanntmachungen listing
  const re = /<li[^>]*class="news-entry-to-limit[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const block = m[1]!;
    const hrefMatch = block.match(/href="(\/bekanntmachungen\/[^"]+)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/) ||
                       block.match(/<a[^>]+href="[^"]+"[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]!);
    const dateMatch = block.match(/news-entry-new-2-date[^>]*>([\s\S]*?)<\/div>/);
    let publishedAt: string = now;
    if (dateMatch) {
      const dateText = dateMatch[1]!.replace(/<[^>]+>/g, "").replace(/&#8203;/g, "").trim();
      publishedAt = parseGermanDate(dateText) ?? now;
    }
    const id = `amt-schenkenlaendchen-notice-${href.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url: absUrl(href), publishedAt, fetchedAt: now });
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

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt, publishedAt: byId.get(i.id)?.publishedAt ?? i.publishedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/amtsblatt/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
