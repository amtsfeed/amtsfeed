#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, AmtsblattFile, Event, NewsItem, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.stadt-muencheberg.de";
const EVENTS_URL = `${BASE_URL}/kultur-tourismus/events`;
const NEWS_URL = `${BASE_URL}/startseite`;
const AMTSBLATT_URL = `${BASE_URL}/buerger-stadt/stadtverwaltung/muencheberger-anzeiger-und-nachrichtenblatt`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function slugify(str: string): string {
  return str.toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// ── Events ────────────────────────────────────────────────────────────────────
// Events are a plain HTML text list in the TYPO3 content element.
// Format: <li class="text-justify"><strong>DD.MM.YYYY[[ -|- bis] DD.MM.YYYY][ | ab H:MM Uhr]</strong><br> Title</li>
// No individual URLs — all events link to the events page.

function parseDate(d: string, m: string, y: string, time?: string): string {
  const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  if (time) {
    const [h, min] = time.split(":");
    return `${date}T${(h ?? "0").padStart(2, "0")}:${(min ?? "00").padStart(2, "0")}:00.000Z`;
  }
  return `${date}T00:00:00.000Z`;
}

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];
  const seen = new Set<string>();

  // Extract the events content block (between "Verstaltungen" header and end of ce-bodytext)
  const bodyMatch = html.match(/class="ce-bodytext">([\s\S]*?)<\/div>/);
  if (!bodyMatch) return events;
  const body = bodyMatch[1]!;

  // Find all <li class="text-justify"> entries
  const liBlocks = [...body.matchAll(/<li\s+class="text-justify">([\s\S]*?)<\/li>/g)];

  for (const m of liBlocks) {
    const raw = m[1]!;
    // Strip all HTML tags to get plain text, then decode
    const text = decodeHtmlEntities(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!text) continue;

    // Pattern: "DD.MM.[YYYY][ -|- bis DD.MM.YYYY][ | ab H:MM Uhr][ |] Title"
    // Example: "17.04.2026 | Frühjahrsputz..."
    // Example: "18.04.2026 | ab 16:00 Uhr Feierliche Übergabe..."
    // Example: "30.04. - 03.05.2026  2. Mittelalterfest..."

    // Try range format: DD.MM.[YYYY] - DD.MM.YYYY
    const rangeMatch = text.match(
      /^(\d{1,2})\.(\d{2})\.(\d{4})?\s*[-–]\s*(\d{1,2})\.(\d{2})\.(\d{4})\s*(?:\|\s*ab\s+(\d+:\d+)\s*Uhr\s*)?(.*)/
    );
    if (rangeMatch) {
      const [, d1, m1, y1, d2, m2, y2, time, rest] = rangeMatch;
      const year = y1 ?? y2!;
      const startDate = parseDate(d1!, m1!, year, time);
      const endDate = parseDate(d2!, m2!, y2!, time);
      const title = rest?.replace(/^\s*\|\s*/, "").trim() ?? "";
      if (!title) continue;
      const id = `muencheberg-${startDate.slice(0, 10).replace(/-/g, "")}-${slugify(title)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      events.push({ id, title, url: EVENTS_URL, startDate, endDate, fetchedAt: now, updatedAt: now });
      continue;
    }

    // Single date: DD.MM.YYYY
    const singleMatch = text.match(
      /^(\d{1,2})\.(\d{2})\.(\d{4})\s*(?:\|\s*ab\s+(\d+:\d+)\s*Uhr\s*)?(.*)/
    );
    if (singleMatch) {
      const [, d1, m1, y1, time, rest] = singleMatch;
      const startDate = parseDate(d1!, m1!, y1!, time);
      const title = rest?.replace(/^\s*\|\s*/, "").trim() ?? "";
      if (!title) continue;
      const id = `muencheberg-${startDate.slice(0, 10).replace(/-/g, "")}-${slugify(title)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      events.push({ id, title, url: EVENTS_URL, startDate, fetchedAt: now, updatedAt: now });
      continue;
    }
  }

  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// ── News ──────────────────────────────────────────────────────────────────────
// News slider on homepage — TYPO3 newsslider extension (EXT:newsslider)
// Container: <a class="card slick-link" href="/path/to/article">
// Date: <time itemprop="datePublished" datetime="YYYY-MM-DD">
// Title: <h5 class="card-title">TITLE</h5>
// ID: last path segment of URL slug

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  const cardBlocks = [...html.matchAll(/<a\s+class="card\s+slick-link"\s+href="([^"]+)">([\s\S]*?)<\/a>/g)];

  for (const m of cardBlocks) {
    const url = `${BASE_URL}${m[1]}`;
    const block = m[2]!;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const titleMatch = block.match(/<h5\s+class="card-title">([\s\S]*?)<\/h5>/);
    if (!titleMatch) continue;

    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const urlPath = m[1]!;
    const id = urlPath.replace(/\//g, "-").replace(/^-+|-+$/g, "");
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : undefined;

    news.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return news;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin. "Müncheberger Anzeiger" = offizielles Amtsblatt.
// PDF filenames: Muencheberger_Anzeiger_MMMM_YYYY.pdf (no issue number)
//                Muencheberger_Anzeiger_MMMM_YYYY_NN.pdf
//                Muencheberger_Anzeiger_MMMM_Nr_N_YYYY.pdf
// Date = first day of the month (actual date not in HTML).

const FILENAME_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", maerz: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", dezember: "12",
};

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items = new Map<string, AmtsblattItem>();
  const now = new Date().toISOString();

  const rx = /href="(\/fileadmin\/[^"]*Muencheberger_Anzeiger_([^"]+\.pdf))"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const path = m[1]!;
    const namePart = m[2]!.replace(/\.pdf$/i, "").toLowerCase();
    // Extract month and year from filename parts
    const parts = namePart.split("_").filter(Boolean);
    let monthNum: string | undefined;
    let year: string | undefined;
    for (const part of parts) {
      if (FILENAME_MONTHS[part]) monthNum = FILENAME_MONTHS[part];
      if (/^\d{4}$/.test(part)) year = part;
    }
    if (!monthNum || !year) continue;
    const id = `muencheberg-amtsblatt-${year}-${monthNum}`;
    // Keep the latest URL per month (handles _korr variants)
    if (!items.has(id)) {
      items.set(id, {
        id,
        title: `Müncheberger Anzeiger ${monthNum}/${year}`,
        url: `${BASE_URL}${path}`,
        publishedAt: `${year}-${monthNum}-01T00:00:00.000Z`,
        fetchedAt: now,
      });
    }
  }

  return [...items.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
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
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return 0;
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/kultur-tourismus/events", "/startseite", "/buerger-stadt/stadtverwaltung/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
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
