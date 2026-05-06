#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.oberkraemer.de";
const NEWS_URL = `${BASE_URL}/news/`;
const AMTSBLATT_URL = `${BASE_URL}/buergerservice/downloads/amtsblatt/`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// TYPO3 custom news/events page:
// <h2 class="second_font event_title">
//   <a class="readmore second_font" href="/artikel-ansicht/show/[slug]/">Title</a>
// </h2>
// <i class="fa fa-fw fa-clock-o mr-1"></i>DD.MM.YYYY

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<h2\s[^>]*event_title)/).filter((b) => /artikel-ansicht\/show\//.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/artikel-ansicht\/show\/([^/"]+)\/?)"[^>]*>([\s\S]*?)<\/a>/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!;
    const id = `oberkraemer-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities((hrefMatch[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/fa-clock-o[^>]*>[\s\S]{0,30}?(\d{2})\.(\d{2})\.(\d{4})/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    items.push({ id, title, url: `${BASE_URL}${href}`, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin — date in `title` attribute as "vom DD.MM.YYYY":
// <a href="/fileadmin/files/06_Service/Amtsblatt/..." title="Amtsblatt Nr. N - Jahrgang NN - vom DD.MM.YYYY">
// 2026+ may use title "Oberkrämer 'Sieben Orte' Nr. N YYYY" with no date → fallback to Jan 1st of year.

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s+href="(\/fileadmin\/files\/06_Service\/Amtsblatt\/[^"]+\.pdf)"[^>]*title="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const titleAttr = decodeHtmlEntities(m[2]!.trim());

    const filename = href.split("/").pop()!.replace(".pdf", "");
    const id = `oberkraemer-amtsblatt-${filename.slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Primary: "vom DD.MM.YYYY" in title attribute
    const dateMatch = titleAttr.match(/vom\s+(\d{2})\.(\d{2})\.(\d{4})/);
    let publishedAt: string;
    if (dateMatch) {
      publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    } else {
      // Fallback: year from title or filename
      const yearMatch = titleAttr.match(/(\d{4})/) ?? href.match(/(\d{4})/);
      publishedAt = yearMatch ? `${yearMatch[1]}-01-01T00:00:00.000Z` : new Date().toISOString();
    }

    const url = `${BASE_URL}${href}`;
    items.push({ id, title: titleAttr, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// TYPO3/WordPress hybrid: notice items in <div class="ovaev-content content-list">
// Date shown as day (in <span class="date-month">) + month name (in nested <span class="month">)
// Year derived from DDMMYYYY in the URL slug (e.g. "am-30042026" → 2026-04-30) or current year
// Title + link in <h2 class="second_font event_title"><a href="/bekanntmachungen/show/[slug]/">

const GERMAN_MONTH_NAMES: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const currentYear = new Date().getFullYear().toString();

  const start = html.indexOf("<!--TYPO3SEARCH_begin-->");
  const end = html.indexOf("<!--TYPO3SEARCH_end-->", start);
  const section = start >= 0 ? html.slice(start, end > start ? end : undefined) : html;

  const blocks = section.split(/(?=<div class="ovaev-content content-list">)/)
    .filter((b) => /\/bekanntmachungen\/show\//.test(b));

  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/bekanntmachungen\/show\/([^"]+))"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!.replace(/\/$/, "");
    const id = `oberkraemer-notice-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h2 class="second_font event_title">\s*<a[^>]+>([\s\S]*?)<\/a>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Try to extract DDMMYYYY from slug (e.g. "am-30042026")
    const slugDateMatch = slug.match(/(\d{2})(\d{2})(\d{4})$/);
    let publishedAt: string;
    if (slugDateMatch) {
      publishedAt = `${slugDateMatch[3]}-${slugDateMatch[2]}-${slugDateMatch[1]}T00:00:00.000Z`;
    } else {
      // Fall back to day/month from display, current year
      const dayMatch = block.match(/<span class="date-month[^"]*">\s*(\d+)/);
      const monthMatch = block.match(/<span class="month[^"]*">\s*(\w+)/);
      const day = dayMatch ? dayMatch[1]!.padStart(2, "0") : "01";
      const mm = monthMatch ? (GERMAN_MONTH_NAMES[monthMatch[1]!] ?? "01") : "01";
      publishedAt = `${currentYear}-${mm}-${day}T00:00:00.000Z`;
    }

    items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/artikel-ansicht/", "/buergerservice/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
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
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);

const noticesPath = join(DIR, "notices.json");
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
