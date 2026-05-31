#!/usr/bin/env tsx
/**
 * Scraper for Amt Friesack (PortUNA / VerwaltungsPortal CMS).
 * https://www.amt-friesack.de
 *
 * News:           /news/1                          — news-entry-to-limit / news-entry-new-2 (Titel in <h5>)
 * Events:         /veranstaltungen/index.php       — event-entry-new-1 (Datum aus URL)
 * Amtsblatt:      /amtsblatt/index.php             — Tabelle Nr./Datum/Form (PDF via POST)
 * Bekanntmachungen:/bekanntmachungen/index.php     — Tabelle mit class="table-title" (Datum) + PDF-Link
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "amt-friesack";
const BASE_URL = "https://www.amt-friesack.de";
const NEWS_URL = `${BASE_URL}/news/1`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

const MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", "März": "03", April: "04", Mai: "05", Juni: "06",
  Juli: "07", August: "08", September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseGermanDate(raw: string): string | null {
  const s = raw.replace(/&#8203;/g, "").replace(/​/g, "").trim();
  const m1 = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2]!.padStart(2, "0")}-${m1[1]!.padStart(2, "0")}T00:00:00.000Z`;
  const m2 = s.match(/(\d{1,2})\.\s*(\S+)\s+(\d{4})/);
  if (m2 && MONTHS[m2[2]!]) return `${m2[3]}-${MONTHS[m2[2]!]}-${m2[1]!.padStart(2, "0")}T00:00:00.000Z`;
  return null;
}

// ── News ──────────────────────────────────────────────────────────────────────
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit)/).filter((b) => b.includes("news-entry-to-limit"));
  for (const block of blocks) {
    const linkMatch = block.match(/<h[1-6][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = stripTags(linkMatch[2] ?? "");
    if (!title) continue;

    const idMatch = href.match(/\/news\/\d+\/(\d+)\//);
    const id = `${SLUG}-news-${idMatch ? idMatch[1] : encodeURIComponent(href).slice(0, 50)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    let publishedAt: string | undefined;
    const dateBlock = block.match(/class="news-entry-new-2-date[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (dateBlock) {
      const dateText = stripTags(dateBlock[1] ?? "");
      const parsed = parseGermanDate(dateText);
      if (parsed) publishedAt = parsed;
    }

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s+href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const title = stripTags(m[6] ?? "");
    if (!title || title.length < 3 || title === "mehr") continue;
    const [, href, eventId, yyyy, mm, dd] = m;
    const id = `${SLUG}-event-${eventId!}-${yyyy}${mm}${dd}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url: `${BASE_URL}${href!}`, startDate: `${yyyy}-${mm}-${dd}T00:00:00.000Z`, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Tabelle: <td>Nr. N/YYYY</td><td>DD.MM.YYYY</td><td><form ...gazette_ID...>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRe = /<td[^>]*>\s*(Nr\.\s*[^<]+?)\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const nrText = stripTags(m[1] ?? "");
    const dateRaw = m[2] ?? "";
    const formBlock = m[3] ?? "";
    if (!nrText.startsWith("Nr.")) continue;
    const publishedAt = parseGermanDate(decodeHtmlEntities(dateRaw));
    if (!publishedAt) continue;

    const gazetteMatch = formBlock.match(/gazette_(\d+)/);
    if (!gazetteMatch) continue;
    const gazetteId = gazetteMatch[1]!;

    const id = `${SLUG}-amtsblatt-${gazetteId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title: `Amtsblatt ${nrText}`, url: `${AMTSBLATT_URL}#gazette_${gazetteId}`, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Bekanntmachungen ──────────────────────────────────────────────────────────
// Tabelle: <td class="table-title">DD.&#8203;MM.&#8203;YYYY</td><td><a href="...pdf">Titel</a> ...
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRe = /<tr[^>]*>\s*<td[^>]*class="table-title"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const dateText = stripTags(m[1] ?? "");
    const publishedAt = parseGermanDate(dateText);
    if (!publishedAt) continue;

    const cell = m[2] ?? "";
    const linkMatch = cell.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const title = stripTags(linkMatch[2] ?? "");
    if (!title) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const id = `${SLUG}-notice-${publishedAt.slice(0, 10)}-${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
    else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
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
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/amtsblatt/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
