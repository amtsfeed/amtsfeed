#!/usr/bin/env tsx
/**
 * Scraper for Amt Ortrand — Joomla! + JEvents
 * https://www.amt-ortrand.de
 *
 * News:  Joomla blog category view on the home page. Articles are
 *   <article> elements; each carries <time datetime="…">, <h2 class="article-title">
 *   with <meta itemprop="url" content="…"> giving the canonical URL (URL slug → id).
 * Events: JEvents accordion at /veranstaltungen. Each panel-heading has
 *   <span class="event-date">DD. Monat YYYY</span><span class="event-title">…</span>.
 *   Detail URLs are not exposed in the listing, so we link to the page itself.
 * Amtsblatt: PDFs listed at /downloads/amtsblätter under /images/Amtsblaeter/YYYY/…pdf
 *   File names follow "Amtsblatt Nr. N - Monat YYYY - DD.MM.YYYY.pdf" (best-effort parse).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-ortrand.de";
const NEWS_URL = `${BASE_URL}/`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen`;
const AMTSBLATT_URL = `${BASE_URL}/downloads/amtsbl%C3%A4tter`;
const ID_PREFIX = "ortrand";
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

const GERMAN_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

function parseGermanDate(s: string): string | undefined {
  // "05. Juni 2026"
  const m = s.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
  if (!m) return undefined;
  const dd = m[1]!.padStart(2, "0");
  const mon = GERMAN_MONTHS[m[2]!.toLowerCase()];
  if (!mon) return undefined;
  return `${m[3]}-${mon}-${dd}`;
}

// ── News (Joomla blog category) ───────────────────────────────────────────────
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Split into <article>…</article> blocks
  const articleRe = /<article>([\s\S]*?)<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1]!;

    const urlMatch = block.match(/<meta\s+itemprop="url"\s+content="([^"]+)"/i);
    if (!urlMatch) continue;
    const url = urlMatch[1]!;
    const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug) continue;

    const id = `${ID_PREFIX}-news-${slug.slice(0, 100)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h2[^>]*article-title[^>]*>([\s\S]*?)<\/h2>/i);
    if (!titleMatch) continue;
    const title = stripHtml((titleMatch[1] ?? "").replace(/<meta[^>]*>/g, ""));
    if (!title) continue;

    const dtMatch = block.match(/<time\s+datetime="([^"]+)"/i);
    let publishedAt: string | undefined;
    if (dtMatch) {
      try { publishedAt = new Date(dtMatch[1]!).toISOString(); } catch { /* ignore */ }
    }

    items.push({
      id,
      title,
      url,
      fetchedAt: now,
      ...(publishedAt ? { publishedAt } : {}),
      updatedAt: now,
    });
  }

  return items;
}

// ── Events (JEvents accordion) ────────────────────────────────────────────────
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Each event lives in a panel-heading containing event-date and event-title
  const re = /<span\s+class="event-date">([^<]+)<\/span>\s*<span\s+class="event-title">([^<]+)<\/span>/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(html)) !== null) {
    const dateStr = decodeHtmlEntities(m[1]!).trim();
    const title = stripHtml(m[2]!);
    if (!title) continue;
    const iso = parseGermanDate(dateStr);
    if (!iso) continue;

    // No per-event URL in listing; create stable id from date+title slug
    const slug = title.toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" } as Record<string, string>)[c]!)
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const id = `${ID_PREFIX}-event-${iso}-${slug || String(idx)}`;
    idx++;
    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      title,
      url: EVENTS_URL,
      startDate: `${iso}T00:00:00.000Z`,
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// PDFs at /images/Amtsblaeter/YYYY/Amtsblatt_Nr._N_-_Monat_YYYY_-_DD.MM.YYYY.pdf
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const re = /href="(\/images\/Amtsblaeter\/(\d{4})\/[^"]+\.pdf)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1]!;
    const year = m[2]!;
    const url = `${BASE_URL}${path}`;

    const filename = decodeURIComponent(path.split("/").pop() ?? "");
    // Try "Amtsblatt_Nr._N(.x)?_-_Monat_YYYY_-_DD.MM.YYYY.pdf"
    const issueMatch = filename.match(/Nr\._?(\d+(?:\.\d+)?)/i);
    const dateMatch = filename.match(/(\d{2})\.(\d{2})\.(\d{4})\.pdf$/i);

    let issue = issueMatch ? issueMatch[1]! : "";
    let publishedAt: string;
    if (dateMatch) {
      publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    } else {
      // Fallback: month name in filename (e.g. Mai_2026_Siegel.pdf)
      const monthMatch = filename.match(/([A-Za-zäöüÄÖÜß]+)_(\d{4})/);
      const month = monthMatch ? GERMAN_MONTHS[monthMatch[1]!.toLowerCase()] : undefined;
      if (!month) continue;
      publishedAt = `${year}-${month}-01T00:00:00.000Z`;
      if (!issue) issue = month;
    }

    const id = issue
      ? `${ID_PREFIX}-amtsblatt-${year}-${issue.replace(/\./g, "_")}`
      : `${ID_PREFIX}-amtsblatt-${publishedAt.slice(0, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = issue
      ? `Amtsblatt Nr. ${issue}/${year}`
      : `Amtsblatt ${filename.replace(/\.pdf$/i, "").replace(/_/g, " ")}`;

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
    if (!byId.has(n.id)) byId.set(n.id, n);
    else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
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
assertAllowed(robots, ["/", "/veranstaltungen", "/downloads/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
