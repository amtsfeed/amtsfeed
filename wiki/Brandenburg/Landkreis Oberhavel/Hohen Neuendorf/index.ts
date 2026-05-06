#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.hohen-neuendorf.de";
const HN_BASE = "https://hohen-neuendorf.de";
const NEWS_RSS_URL = `${BASE_URL}/de/rss-feed.xml`;
const EVENTS_URL = `${BASE_URL}/de/stadt-leben/veranstaltungskalender`;
const AMTSBLATT_URL = `${BASE_URL}/de/rathaus-politik/amtsblatt`;
const NOTICES_URL = `${HN_BASE}/de/rathaus-politik/bekanntmachungen/allgemeine-bekanntmachungen`;
const DIR = dirname(fileURLToPath(import.meta.url));

// Filename-based month/year parser for inconsistent PDF names like:
// amtsblatt_hn_0426_b.pdf (MMYY concatenated), amtsblatt_hn_feb_26_b.pdf (mon_YY),
// amtsblatt_3_26_b.pdf (M_YY), amtsblatt_hn_nov25_b.pdf (monYY concatenated),
// amtsblatt_hn_10_25_b.pdf (MM_YY), amtsblatt_hn_juni25_b.pdf (full-name+YY)

const HN_MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", mrz: "03", apr: "04", mai: "05",
  jun: "06", juli: "07", jul: "07", aug: "08", sep: "09",
  okt: "10", nov: "11", dez: "12",
};

function parseHNFilename(filename: string): { yyyy: string; mm: string } | undefined {
  const stem = filename.toLowerCase().replace(/\.pdf$/, "");

  // Pattern A: 4 consecutive digits MMYY (e.g. 0426, 0925, 0325)
  const mmyy = stem.match(/_(\d{2})(\d{2})(?:_|$)/);
  if (mmyy) {
    const month = parseInt(mmyy[1]!);
    if (month >= 1 && month <= 12) return { yyyy: `20${mmyy[2]}`, mm: mmyy[1]! };
  }

  // Pattern B: MM_YY (e.g. _10_25_)
  const mmYY = stem.match(/_(\d{2})_(\d{2})_/);
  if (mmYY) {
    const month = parseInt(mmYY[1]!);
    if (month >= 1 && month <= 12) return { yyyy: `20${mmYY[2]}`, mm: mmYY[1]! };
  }

  // Pattern C: M_YY single digit (e.g. _3_26_)
  const mYY = stem.match(/_(\d)_(\d{2})_/);
  if (mYY) return { yyyy: `20${mYY[2]}`, mm: mYY[1]!.padStart(2, "0") };

  // Pattern D/E: German month name (abbreviated) + optional separator + 2-digit year
  for (const [abbr, mm] of Object.entries(HN_MONTHS)) {
    // Match: _<abbr>[optional extra letters]_?<2-digit-year> (e.g. _feb_26_, _juni25_, _nov25_)
    const re = new RegExp(`_${abbr}[a-z]*_?(\\d{2})(?:_|$)`, "i");
    const m = stem.match(re);
    if (m) return { yyyy: `20${m[1]}`, mm };
  }

  return undefined;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// Drupal RSS feed at /de/rss-feed.xml

function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const block of xml.split("<item>").slice(1)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch || !linkMatch) continue;
    const url = linkMatch[1]!.trim();
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    if (!title || !url) continue;

    // Drupal URL: /de/stadt-leben/aktuelles/slug → use slug as ID
    const idMatch = url.match(/\/de\/[^?#]+\/([^/?#]+)(?:[?#].*)?$/);
    const id = idMatch ? `hohen-neuendorf-news-${idMatch[1]!}` : url;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubDateMatch) {
      try { publishedAt = new Date(pubDateMatch[1]!.trim()).toISOString(); } catch { /* ignore */ }
    }

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Events ────────────────────────────────────────────────────────────────────
// Drupal views-row list:
// <div class="views-row ... col-xs-24"><div class="event">
//   <div class="eventtitle"><div class="start border">DD.MM.YYYY</div></div>
//   <h4 class="titel"><a href="/de/stadt-leben/veranstaltungskalender/SLUG">Title</a></h4>

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s[^>]*class="views-row\s)/).filter((b) => /class="event"/.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/de\/stadt-leben\/veranstaltungskalender\/([^"/?#]+))"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!;
    const id = `hohen-neuendorf-event-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h4\s+class="titel"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/<div\s+class="start border">(\d{2})\.(\d{2})\.(\d{4})<\/div>/);
    if (!dateMatch) continue;
    const startDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const url = `${BASE_URL}${href}`;
    items.push({ id, title, url, startDate, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Drupal thumbnail grid — inconsistent PDF filenames, no dates in HTML.
// Filenames: amtsblatt_hn_0426_b.pdf, amtsblatt_3_26_b.pdf, amtsblatt_hn_feb_26_b.pdf, etc.
// Date inferred from filename; entries without parseable date are skipped.

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /"(https?:\/\/hohen-neuendorf\.de\/sites\/default\/files\/[^"]*amtsblatt[^"]*\.pdf)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!;
    const filename = url.split("/").pop()!;
    const stem = filename.replace(/\.pdf$/, "");

    const id = `hohen-neuendorf-amtsblatt-${stem.slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const parsed = parseHNFilename(filename);
    if (!parsed) continue; // skip if can't parse date

    const publishedAt = `${parsed.yyyy}-${parsed.mm}-01T00:00:00.000Z`;
    const title = `Amtsblatt Hohen Neuendorf ${parsed.mm}/${parsed.yyyy}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Drupal views: each notice has a date + PDF link.
// <div class="views-field views-field-field-ausgabe"><div class="field-content">
//   <span class="date-display-single">DD.MM.YYYY</span></div></div>
// <div class="views-field views-field-field-pdf-dateien">...
//   <a href="https://hohen-neuendorf.de/sites/default/files/beteiligungsverfahren/FILENAME.pdf">FILENAME.pdf</a>

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Split on views-row blocks
  const blocks = html.split('<div class="views-row').slice(1);
  for (const block of blocks) {
    const dateMatch = block.match(/<span class="date-display-single">(\d{2})\.(\d{2})\.(\d{4})<\/span>/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const pdfMatch = block.match(/href="(https?:\/\/hohen-neuendorf\.de\/sites\/default\/files\/[^"]+\.pdf)"/i);
    if (!pdfMatch) continue;
    const url = pdfMatch[1]!;
    const filename = url.split("/").pop()!.replace(/\.pdf$/i, "");

    const id = `hohen-neuendorf-notice-${filename.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/href="[^"]+\.pdf"[^>]*>([^<]+)<\/a>/i);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? filename).trim());

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
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
assertAllowed(robots, ["/de/rss-feed.xml", "/de/rathaus-politik/", "/de/stadt-leben/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [rssXml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(rssXml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);

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
