#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-ziesar.de";
const NEWS_URL = `${BASE_URL}/aktuelles.html`;
const NOTICES_URL = `${BASE_URL}/service/bekanntmachungen.html`;
const AMTSBLATT_ROOT_CAT = 59; // "Amtsblätter, hier herunterladen:"
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanLongDate(dateStr: string): string {
  const m = dateStr.trim().match(/(\d{1,2})\.\s+([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
  if (!m) return new Date().toISOString();
  const mm = GERMAN_MONTHS[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

// Custom CMS: <h2><a href="/aktuelles/slug.html">Title</a></h2>
//             <p>DD. Month YYYY</p>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<h2[^>]*>\s*<a href="(\/aktuelles\/([^"]+)\.html)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const slug = m[2]!;
    const id = `amt-ziesar-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Date is in the next <p> after the heading
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 200);
    const dateMatch = after.match(/<p>([^<]+)<\/p>/);
    const publishedAt = dateMatch ? parseGermanLongDate(decodeHtmlEntities(dateMatch[1]!)) : now;

    items.push({ id, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Joomla blog layout: <h2><a href="/service/bekanntmachungen/SLUG.html">Title</a></h2>
// Some slugs: "DD-MM-YYYY-title-text" → date from slug prefix
// Others: no date in slug → use today's date as fallback

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<h2[^>]*>\s*<a href="(\/service\/bekanntmachungen\/([^"]+)\.html)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const slug = m[2]!;
    const id = `amt-ziesar-notice-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Try to parse DD-MM-YYYY from slug start
    let publishedAt = now;
    const slugDate = slug.match(/^(\d{2})-(\d{2})-(\d{4})-/);
    if (slugDate) {
      publishedAt = `${slugDate[3]}-${slugDate[2]}-${slugDate[1]}T00:00:00.000Z`;
    }

    items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Joomla com_dropfiles: year subcategories under root cat 59
// API: /index.php?option=com_dropfiles&view=frontcategories&format=json&id=59&top=59
//      /index.php?option=com_dropfiles&view=frontfiles&format=json&id=CATID
// File fields: id, title, created_time (DD-MM-YYYY), link (download page URL)

interface DropfilesCategory { id: number; title: string; }
interface DropfilesFile { id: number; title: string; created_time: string; link: string; }

async function fetchAmtsblatt(headers: Record<string, string>): Promise<AmtsblattItem[]> {
  const now = new Date().toISOString();
  const catsUrl = `${BASE_URL}/index.php?option=com_dropfiles&view=frontcategories&format=json&id=${AMTSBLATT_ROOT_CAT}&top=${AMTSBLATT_ROOT_CAT}`;
  const catsData = await fetch(catsUrl, { headers }).then((r) => r.ok ? r.json() as Promise<{ categories?: DropfilesCategory[] }> : { categories: [] });
  const cats = (catsData.categories ?? [])
    .filter((c) => /^\d{4}$/.test(c.title))
    .sort((a, b) => Number(b.title) - Number(a.title))
    .slice(0, 2); // last 2 years

  const items: AmtsblattItem[] = [];
  for (const cat of cats) {
    const filesUrl = `${BASE_URL}/index.php?option=com_dropfiles&view=frontfiles&format=json&id=${cat.id}`;
    const filesData = await fetch(filesUrl, { headers }).then((r) => r.ok ? r.json() as Promise<{ files?: DropfilesFile[] }> : { files: [] });
    for (const f of filesData.files ?? []) {
      // created_time: "DD-MM-YYYY"
      const dateMatch = f.created_time.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const publishedAt = dateMatch
        ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`
        : now;
      items.push({
        id: `amt-ziesar-amtsblatt-${f.id}`,
        title: f.title,
        url: f.link,
        publishedAt,
        fetchedAt: now,
      });
    }
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
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
assertAllowed(robots, ["/aktuelles", "/verwaltung/amtsblaetter", "/service/bekanntmachungen"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattItems, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`);
    return r.text();
  }),
  fetchAmtsblatt(headers),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);

const amtsblattPath = join(DIR, "amtsblatt.json");
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, amtsblattItems);
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);

const noticesPath = join(DIR, "notices.json");
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
