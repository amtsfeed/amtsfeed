#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.fuerstenberg-havel.de";
const NEWS_URL = `${BASE_URL}/buergerservice/aktuelles`;
const AMTSBLATT_URL = `${BASE_URL}/rathaus-und-politik/rathaus/fuerstenberger-anzeiger/`;
const NOTICES_URL = `${BASE_URL}/rathaus-und-politik/rathaus/bekanntmachungen`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// TYPO3 tx_news newsbox grid:
// <div class="newsbox col-md-6 col-lg-4 my-4">
//   <a title="Title" href="/buergerservice/aktuelles/details/[slug]">
//     <div class="overlay">
//       <p class="mb-1 small date text-white"><i class="fa fa-calendar-o..."></i>DD.MM.YYYY</p>
//       <h4 class="h5 mb-1 text-white">Title</h4>
//     </div>
//   </a>
// </div>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s[^>]*class="newsbox\s)/).filter((b) => /\/aktuelles\/details\//.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/buergerservice\/aktuelles\/details\/([^"]+))"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!.replace(/\/$/, "");
    const id = `fuerstenberg-havel-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h4\s+class="[^"]*">([\s\S]*?)<\/h4>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Date after calendar icon: <i class="fa fa-calendar-o ..."></i>\n          DD.MM.YYYY
    const dateMatch = block.match(/fa-calendar-o[^>]*>[\s\S]{0,50}?(\d{2})\.(\d{2})\.(\d{4})/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    items.push({ id, title, url: `${BASE_URL}${href}`, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin thumbnail grid:
// <a href="/fileadmin/Redaktion/Dokumente/Amtsblatt/YYYY/NN_Amtsblatt_NN_YYYY.pdf.pdf" title="Ausgabe NN/YYYY ansehen">
// <p><b>Ausgabe NN/YYYY</b><br/>vom DD. Monat YYYY</p>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match blocks: PDF link + following <p> with "vom DD. Monat YYYY"
  const blockRx = /<a\s+href="(\/fileadmin\/Redaktion\/Dokumente\/Amtsblatt\/[^"]+\.pdf(?:\.pdf)?)"[^>]*title="([^"]+)"[^>]*>[\s\S]{0,400}?<p[^>]*><b>(Ausgabe[\s\S]*?)<\/b><br\s*\/>vom\s+(\d{1,2})\.\s*(\w+)\s+(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRx.exec(html)) !== null) {
    const href = m[1]!;
    const ausgabe = m[3]!.trim(); // e.g. "Ausgabe 05/2026"
    const dd = m[4]!;
    const monthName = m[5]!;
    const yyyy = m[6]!;

    const mm = GERMAN_MONTHS[monthName];
    if (!mm) continue;

    const filename = href.split("/").pop()!.replace(/\.pdf\.pdf$/, "").replace(/\.pdf$/, "");
    const id = `fuerstenberg-havel-amtsblatt-${filename.slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = `${ausgabe} vom ${dd.padStart(2, "0")}. ${monthName} ${yyyy}`;
    const publishedAt = `${yyyy}-${mm}-${dd.padStart(2, "0")}T00:00:00.000Z`;
    const url = `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// TYPO3: each notice is a frame block with h3 title + fileadmin PDF links
// <div id="c{ID}" class="frame ..."><header><h3>Title</h3></header><p><a href="/fileadmin/...pdf">Link text</a>...</p></div>
// ID from frame div id (e.g. "c1930"). First PDF link is the primary URL.
// No date available → use fetchedAt as publishedAt approximation (set to year from file path or now).

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Find section after "Amtliche Bekanntmachungen" h1
  const sectionStart = html.indexOf("Amtliche Bekanntmachungen");
  if (sectionStart < 0) return items;
  const section = html.slice(sectionStart);

  // Each frame with h3 + fileadmin PDF
  const frameRx = /<div id="(c\d+)" class="frame[^"]*">\s*(?:<div[^>]*>)*\s*<header>\s*<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<div id="c\d+"|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = frameRx.exec(section)) !== null) {
    const frameId = m[1]!;
    const rawTitle = m[2]!;
    const frameContent = m[3]!;

    const title = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Find first fileadmin PDF link
    const pdfMatch = frameContent.match(/href="(\/fileadmin\/[^"]+\.pdf)"/i);
    if (!pdfMatch) continue;

    const id = `fuerstenberg-notice-${frameId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const pdfHref = pdfMatch[1]!;
    const url = `${BASE_URL}${pdfHref}`;

    // Try to extract year from PDF path
    const yearMatch = pdfHref.match(/\/(20\d{2})\//);
    const publishedAt = yearMatch ? `${yearMatch[1]}-01-01T00:00:00.000Z` : now;

    items.push({ id, title, url, publishedAt, fetchedAt: now });
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
assertAllowed(robots, ["/buergerservice/aktuelles", "/rathaus-und-politik/"]);

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
