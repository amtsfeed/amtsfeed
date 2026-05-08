#!/usr/bin/env tsx
/**
 * Scraper for Luckau — Sitepark CMS
 * https://www.luckau.de (redirects from www.luckau.de → luckau.de)
 *
 * News: https://luckau.de/de/buergerportal/aktuelles/aktuelle-meldungen.html
 *   Articles listed with class="listItem", id="article_SLUG", including dateText
 *
 * Amtsblatt: https://luckau.de/de/buergerportal/amtsblaetter/archiv-...2026.html
 *   Table with date and PDF links (amtsblatt column = 2nd column)
 *
 * Notices: https://luckau.de/de/buergerportal/buergerservice-formulare/oeffentliche-bekanntmachungen.html
 *   Accordion-style table with Veröffentlicht am, Titel, PDF download
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://luckau.de";
const NEWS_URL = `${BASE_URL}/de/buergerportal/aktuelles/aktuelle-meldungen.html`;
const AMTSBLATT_2026_URL = `${BASE_URL}/de/buergerportal/amtsblaetter/archiv-ausgaben-des-luckauer-anzeigers-mit-dem-amtsblatt-fuer-die-stadt-luckau/artikel-ausgaben-des-luckauer-lokalanzeigers-amtsblattes-2026.html`;
const AMTSBLATT_2025_URL = `${BASE_URL}/de/buergerportal/amtsblaetter/archiv-ausgaben-des-luckauer-anzeigers-mit-dem-amtsblatt-fuer-die-stadt-luckau/artikel-ausgaben-des-luckauer-lokalanzeigers-amtsblattes-2025.html`;
const NOTICES_URL = `${BASE_URL}/de/buergerportal/buergerservice-formulare/oeffentliche-bekanntmachungen.html`;
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

function absUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Sitepark: <article id="article_SLUG"> containing dateText and link
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const re = /<article\s+id="article_([^"]+)"[^>]*class="listItem[^"]*"[^>]*>([\s\S]*?)(?=<article\s|<\/div>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1]!;
    const block = m[2]!;

    const hrefMatch = block.match(/href="(\/de\/buergerportal\/aktuelles\/aktuelle-meldungen\/[^"]+)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;

    const titleMatch = block.match(/title="([^"]+)"/);
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]!);

    const dateMatch = block.match(/class="dateText">([^<]+)/);
    let publishedAt: string | null = null;
    if (dateMatch) {
      publishedAt = parseGermanDate(dateMatch[1]!);
    }

    const id = `luckau-news-${slug.slice(0, 80)}`;
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
// Table: col1=Lokalanzeiger PDF+date, col2=Amtsblatt PDF+date
// Only harvest the Amtsblatt (col2) entries that have a PDF link
function extractAmtsblatt(html: string, yearHint: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Extract table rows
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  let rowNum = 0;
  while ((m = rowRe.exec(html)) !== null) {
    rowNum++;
    if (rowNum === 1) continue; // skip header row
    const row = m[1]!;
    // Get all <td> cells
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]!);
    if (cells.length < 2) continue;

    // col1 = Lokalanzeiger, col2 = Amtsblatt
    const amtsblattCell = cells[1] ?? "";

    // Extract PDF link from amtsblatt cell
    const pdfMatch = amtsblattCell.match(/href="([^"]+\.pdf)"/i);
    if (!pdfMatch) continue;
    const pdfUrl = pdfMatch[1]!;

    // Extract date from cell (may be in anchor text or plain text)
    const dateRaw = decodeHtml(amtsblattCell);
    const parsedDate = parseGermanDate(dateRaw);
    // Fallback: derive from PDF path if possible
    let publishedAt = parsedDate;
    if (!publishedAt) {
      // Try to get date from col1 (Lokalanzeiger cell)
      const col1Date = parseGermanDate(decodeHtml(cells[0] ?? ""));
      publishedAt = col1Date;
    }
    if (!publishedAt) continue;

    const slug = pdfUrl.split("/").pop()?.replace(/\.pdf$/i, "") ?? pdfUrl;
    const id = `luckau-amtsblatt-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt ${yearHint} (${publishedAt.slice(0, 10)})`,
      url: absUrl(pdfUrl),
      publishedAt,
      fetchedAt: now,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices (Öffentliche Bekanntmachungen) ────────────────────────────────────
// Accordion table: col0=date, col2=title, col4=PDF link
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Extract table rows within accordion sections
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  let lastDate: string | null = null;

  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1]!;
    if (/Veröffentlicht|background-color.*dcdcdc/i.test(row)) continue; // header row
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]!);
    if (cells.length < 5) continue;

    const dateCellText = decodeHtml(cells[0] ?? "").trim();
    const titleCellText = decodeHtml(cells[2] ?? "").trim();
    const downloadCell = cells[4] ?? "";

    // Update lastDate if current row has a date
    const parsedDate = parseGermanDate(dateCellText);
    if (parsedDate) lastDate = parsedDate;

    // Extract PDF link
    const pdfMatch = downloadCell.match(/href="([^"]+\.pdf)"/i);
    if (!pdfMatch || !titleCellText) continue;
    const pdfUrl = pdfMatch[1]!;

    // Extract title from download link if title cell is empty
    let title = titleCellText;
    if (!title) {
      title = decodeHtml(downloadCell).trim();
    }
    if (!title) continue;

    const publishedAt = lastDate ?? now;
    const slug = pdfUrl.split("/").pop()?.replace(/\.pdf$/i, "") ?? pdfUrl;
    const id = `luckau-notice-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url: absUrl(pdfUrl), publishedAt, fetchedAt: now });
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
assertAllowed(robots, ["/de/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblatt2026Html, amtsblatt2025Html, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_2026_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_2025_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, [
  ...extractAmtsblatt(amtsblatt2026Html, "2026"),
  ...extractAmtsblatt(amtsblatt2025Html, "2025"),
]);
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
