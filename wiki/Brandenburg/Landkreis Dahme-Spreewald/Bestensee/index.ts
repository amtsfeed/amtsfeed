#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.bestensee.de";
const NEWS_URL = `${BASE_URL}/index.php?id=1057`;
const AMTSBLATT_URL = `${BASE_URL}/index.php?id=300`;
const NOTICES_URL = `${BASE_URL}/index.php?id=1019`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", "märz": "03", maerz: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function slugFromFilename(href: string): string {
  const file = decodeURIComponent(href.split("/").pop() ?? href).replace(/\.pdf$/i, "");
  return file.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80);
}

// Extract <a class="download" href="..."> entries.
function extractDownloads(html: string): Array<{ href: string; title: string }> {
  const out: Array<{ href: string; title: string }> = [];
  const re = /<a\s+href="([^"]+)"[^>]*class="download"[^>]*>([\s\S]*?)<\/a>/gi;
  // Also handle attribute order: class first, then href.
  const re2 = /<a\s+[^>]*class="download"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const re_ of [re, re2]) {
    let m: RegExpExecArray | null;
    while ((m = re_.exec(html)) !== null) {
      const href = m[1]!;
      const title = decodeHtmlEntities((m[2] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
      if (!title || !href) continue;
      out.push({ href, title });
    }
  }
  return out;
}

function absUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// Try to derive (year, month) from title or filename.
// Patterns:
//   "Nr. NN-YYYY", "Nr. NN/YYYY"
//   filename: "Bestwiner Januar 2026", "FINAL Bestwiner Januar 2025", "BESTWINER 05 2015"
function deriveDate(title: string, filename: string): { year?: string; month?: string } {
  const haystacks = [title, decodeURIComponent(filename)];

  for (const h of haystacks) {
    const numMatch = h.match(/Nr\.?\s*(\d{1,2})\s*[-\/]\s*(\d{4})/i);
    if (numMatch) {
      return { year: numMatch[2]!, month: numMatch[1]!.padStart(2, "0") };
    }
  }
  for (const h of haystacks) {
    const monthYear = h.toLowerCase().match(/(januar|februar|m[äa]rz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)[\s_-]*(\d{4})/i);
    if (monthYear) {
      const mm = GERMAN_MONTHS[monthYear[1]!.toLowerCase().replace("ä", "ae")] ?? GERMAN_MONTHS[monthYear[1]!.toLowerCase()];
      if (mm) return { year: monthYear[2]!, month: mm };
    }
  }
  for (const h of haystacks) {
    const yearOnly = h.match(/\b(20\d{2})\b/);
    if (yearOnly) return { year: yearOnly[1]! };
  }
  return {};
}

// ── News (Pressemitteilungen) ─────────────────────────────────────────────────

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const { href, title } of extractDownloads(html)) {
    if (!/\.pdf(\?|$)/i.test(href)) continue;
    if (!/(?:assets\/Kirsch|fileadmin)/i.test(href)) continue;

    const filename = href.split("/").pop() ?? href;
    const slug = slugFromFilename(href);
    const id = `bestensee-news-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const { year, month } = deriveDate(title, filename);
    const publishedAt = year && month
      ? `${year}-${month}-01T00:00:00.000Z`
      : year
        ? `${year}-01-01T00:00:00.000Z`
        : undefined;

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

// ── Amtsblatt ("Bestwiner") ───────────────────────────────────────────────────

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const { href, title } of extractDownloads(html)) {
    if (!/\.pdf(\?|$)/i.test(href)) continue;

    const filename = href.split("/").pop() ?? href;
    const slug = slugFromFilename(href);
    const id = `bestensee-amtsblatt-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const { year, month } = deriveDate(title, filename);
    // Skip entries we cannot date at all (probably not amtsblatt).
    if (!year) continue;

    const publishedAt = month
      ? `${year}-${month}-01T00:00:00.000Z`
      : `${year}-01-01T00:00:00.000Z`;

    items.push({
      id,
      title: title.startsWith("Nr.") ? `Bestwiner ${title}` : title,
      url: absUrl(href),
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices (Bekanntmachungen) ────────────────────────────────────────────────

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const { href, title } of extractDownloads(html)) {
    if (!/\.pdf(\?|$)/i.test(href)) continue;

    const filename = href.split("/").pop() ?? href;
    const slug = slugFromFilename(href);
    const id = `bestensee-notice-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const { year, month } = deriveDate(title, filename);
    const publishedAt = year && month
      ? `${year}-${month}-01T00:00:00.000Z`
      : year
        ? `${year}-01-01T00:00:00.000Z`
        : now;

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
assertAllowed(robots, ["/index.php", "/fileadmin/"]);

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
