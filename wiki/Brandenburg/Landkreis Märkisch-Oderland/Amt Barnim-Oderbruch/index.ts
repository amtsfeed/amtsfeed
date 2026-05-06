#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.barnim-oderbruch.de";
const EVENTS_URL = `${BASE_URL}/aktuelles/veranstaltungen`;
const NEWS_URL = `${BASE_URL}/aktuelles`;
const AMTSBLATT_BASE_URL = `${BASE_URL}/aktuelles/bekanntmachungen/amtsblaetter`;
const NOTICES_SUBCATS = [
  `${BASE_URL}/aktuelles/bekanntmachungen/hinweise-/-verbote`,
  `${BASE_URL}/aktuelles/bekanntmachungen/oeffentlichkeitsbeteiligung-bei-planungen`,
  `${BASE_URL}/aktuelles/bekanntmachungen/allgemeinverfuegungen`,
  `${BASE_URL}/aktuelles/bekanntmachungen/wahlen`,
];
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Shared parser for TYPO3 EXT:news items ───────────────────────────────────
// Container: <div class="post-item article ...">
// Date: <time itemprop="datePublished" datetime="YYYY-MM-DD">
// Title: <span itemprop="headline">TITLE</span>
// URL: <a itemprop="url" href="URL">
// ID: last slug segment of URL

function parseItems(html: string): Array<{ id: string; title: string; url: string; date?: string; description?: string }> {
  const result = [];

  const blocks = html.split(/(?=<div\s+class="post-item\s+article)/)
    .filter((b) => b.includes('class="post-item article'));

  for (const block of blocks) {
    const urlMatch = block.match(/itemprop="url"[^>]*href="([^"]+)"/);
    if (!urlMatch) continue;
    const href = urlMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleMatch = block.match(/itemprop="headline">([^<]+)</);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const dateMatch = block.match(/itemprop="datePublished"\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    const date = dateMatch ? dateMatch[1]! : undefined;

    const descMatch = block.match(/itemprop="description">([\s\S]*?)<\/div>/i);
    const description = descMatch
      ? decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    // ID from slug: last segment of path
    const id = href.split("/").filter(Boolean).pop() ?? href;

    result.push({ id, title, url, date, description });
  }
  return result;
}

// ── Events ────────────────────────────────────────────────────────────────────

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  return parseItems(html).map(({ id, title, url, date, description }) => ({
    id,
    title,
    url,
    startDate: date ? `${date}T00:00:00.000Z` : now,
    ...(description ? { description } : {}),
    fetchedAt: now,
    updatedAt: now,
  }));
}

// ── News ──────────────────────────────────────────────────────────────────────

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  return parseItems(html)
    .filter((item) => item.url.includes("/aktuelles/detail/"))
    .map(({ id, title, url, date, description }) => ({
      id,
      title,
      url,
      ...(description ? { description } : {}),
      fetchedAt: now,
      ...(date ? { publishedAt: `${date}T00:00:00.000Z` } : {}),
      updatedAt: now,
    }));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin — year pages at /aktuelles/bekanntmachungen/amtsblaetter/YYYY
// PDF: /fileadmin/Daten/Aktuelles/Bekanntmachungen/Amtsblätter/Amtsblätter_YYYY/Amtsblatt_NN-YYYY.pdf
// Filenames use both numeric (NN-YYYY) and German month names (Januar, März, etc.)
// Sonderausgaben skipped; no dates in HTML → publishedAt = YYYY-MM-01

const BARNIM_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", "m%c3%a4rz": "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", dezember: "12",
};

function extractAmtsblatt(html: string, year: string): AmtsblattItem[] {
  const items = new Map<string, AmtsblattItem>();
  const now = new Date().toISOString();
  const rx = /href="(\/fileadmin\/Daten\/Aktuelles\/Bekanntmachungen\/[^"]+\.pdf)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const rawPath = m[1]!;
    const filename = rawPath.split("/").pop()!.toLowerCase();

    if (filename.includes("sonder") || filename.includes("sonderausgabe")) continue;

    let num: string | undefined;

    // Try numeric: amtsblatt_NN-YYYY or amtsblatt_NN-YYYY_NN (suffix variant)
    const numMatch = filename.match(/amtsblatt[^_]*[_-](\d{1,2})[_-]\d{4}/) ??
      filename.match(/[_-](\d{2})[_-]\d{4}/);
    if (numMatch) {
      num = numMatch[1]!.padStart(2, "0");
    } else {
      // Try month name (URL-encoded or plain)
      for (const [name, month] of Object.entries(BARNIM_MONTHS)) {
        if (filename.includes(name)) {
          num = month;
          break;
        }
      }
    }
    if (!num) continue;

    const id = `barnim-oderbruch-amtsblatt-${year}-${num}`;
    if (!items.has(id)) {
      items.set(id, {
        id,
        title: `Amtsblatt Nr. ${num}/${year}`,
        url: `${BASE_URL}${rawPath}`,
        publishedAt: `${year}-${num}-01T00:00:00.000Z`,
        fetchedAt: now,
      });
    }
  }
  return [...items.values()];
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Barnim-Oderbruch subcategory pages with ce-uploads file lists:
// <li class="list-link">
//   <a href="/fileadmin/..." title="TITLE">
//     <span class="ce-uploads-fileName">TITLE</span>
//   </a>
// No dates in HTML — use fetchedAt as placeholder.
// ID: slug from fileadmin path filename.

function extractNotices(html: string, sourceUrl: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const re = /<li\s+class="list-link">\s*<a\s+href="(\/fileadmin\/[^"]+)"[^>]*title="([^"]+)">/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]!;
    const title = decodeHtmlEntities(m[2]!.trim());
    if (!title) continue;

    const filename = decodeURIComponent(href.split("/").pop() ?? href)
      .replace(/\.pdf$/i, "").replace(/[^a-z0-9_\-äöüÄÖÜß]/gi, "-").toLowerCase().slice(0, 80);
    const id = `amt-barnim-oderbruch-notice-${filename}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt: now, fetchedAt: now });
  }

  return items;
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt, publishedAt: byId.get(n.id)?.publishedAt ?? n.publishedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) {
      byId.set(n.id, n);
    } else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  // Sort by publishedAt desc, then by id (slug) desc for undated items
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return b.id.localeCompare(a.id);
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/aktuelles/veranstaltungen", "/aktuelles", "/aktuelles/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const currentYear = new Date().getFullYear().toString();
const prevYear = (new Date().getFullYear() - 1).toString();

const [eventsHtml, newsHtml, amtsblatt2025Html, amtsblatt2026Html, ...noticesHtmls] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(`${AMTSBLATT_BASE_URL}/${prevYear}`, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(`${AMTSBLATT_BASE_URL}/${currentYear}`, { headers }).then((r) => r.ok ? r.text() : ""),
  ...NOTICES_SUBCATS.map((url) => fetch(url, { headers }).then((r) => r.ok ? r.text() : "")),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const incomingAmtsblatt = [
  ...extractAmtsblatt(amtsblatt2025Html, prevYear),
  ...extractAmtsblatt(amtsblatt2026Html, currentYear),
];

const incomingNotices = NOTICES_SUBCATS.flatMap((url, i) => extractNotices(noticesHtmls[i] ?? "", url));

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, incomingAmtsblatt);
const mergedNotices = mergeNotices(existingNotices.items, incomingNotices);

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
