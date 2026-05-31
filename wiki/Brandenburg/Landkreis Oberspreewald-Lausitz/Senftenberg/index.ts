#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.senftenberg.de";
const SLUG = "senftenberg";
const KOMMUNE_ID = "2779";
const NEWS_URL = `${BASE_URL}/Rathaus/Presseservice/Aktuelle-Pressemitteilungen/`;
const EVENTS_URL = `${BASE_URL}/B%C3%BCrger/Veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/Rathaus/Amtliche-Informationen/Amtsbl%C3%A4tter-der-Stadt-Senftenberg.php?object=tx,2779.5&ModID=7&FID=2055.3890.1&NavID=2779.394&La=1`;
const NOTICES_URL = `${BASE_URL}/Rathaus/Amtliche-Informationen/Amtliche-Bekanntmachungen/`;
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

// Senftenberg's IKISS pages are ISO-8859-15 encoded
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": AMTSFEED_UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder("iso-8859-15").decode(buf);
}

async function fetchTextOptional(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": AMTSFEED_UA } });
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    return new TextDecoder("iso-8859-15").decode(buf);
  } catch { return ""; }
}

// ── News ──────────────────────────────────────────────────────────────────────
// IKISS Senftenberg variant:
// <div class="mitteilungen clearfix" data-ikiss-mfid="7.2779.NNNNN.1">
//   <div class="liste_titel"><a href="...">Title</a></div>
//   <div class="date"><span>DD.MM.YYYY</span></div>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="mitteilungen clearfix" data-ikiss-mfid="7\.2779\.)/)
    .filter((b) => b.startsWith('<div class="mitteilungen clearfix" data-ikiss-mfid="7.2779.'));

  for (const block of blocks) {
    const mfidMatch = block.match(/data-ikiss-mfid="7\.2779\.(\d+)\.1"/);
    if (!mfidMatch) continue;
    const newsId = mfidMatch[1]!;
    const id = `${SLUG}-news-${newsId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<div class="liste_titel"><a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/<div class="date[^"]*">[\s\S]*?<span>(\d{2})\.(\d{2})\.(\d{4})<\/span>/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href.replace(/&amp;/g, "&")}`;
    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// <div class="veranstaltungen clearfix" data-ikiss-mfid="11.2779.NNNN.1">
//   <div class="liste_titel"><a href="...">Title</a></div>
//   <div class="date">DD.MM.YYYY</div>

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="veranstaltungen clearfix" data-ikiss-mfid="11\.2779\.)/)
    .filter((b) => b.startsWith('<div class="veranstaltungen clearfix" data-ikiss-mfid="11.2779.'));

  for (const block of blocks) {
    const mfidMatch = block.match(/data-ikiss-mfid="11\.2779\.(\d+)\.1"/);
    if (!mfidMatch) continue;
    const eventId = mfidMatch[1]!;
    const id = `${SLUG}-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<div class="liste_titel"><a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/<div class="date">\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) continue;
    const startDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href.replace(/&amp;/g, "&")}`;
    items.push({ id, title, url, startDate, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// <div class="dokumente doc-customzip" data-ikiss-mfid="6.2779.NNNN.1">
//   <a href="/output/download.php?...PDF...&fn=Amtsblatt..." class="csslink_PDF">Amtsblatt_Jg._XX_Nr. N vom DD. Monat YYYY</a>

const GERMAN_MONTHS_FULL: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="dokumente[^"]*" data-ikiss-mfid="6\.2779\.)/)
    .filter((b) => b.startsWith('<div class="dokumente'));

  for (const block of blocks) {
    const mfidMatch = block.match(/data-ikiss-mfid="6\.2779\.(\d+)\.1"/);
    if (!mfidMatch) continue;
    const linkMatch = block.match(/<div class="liste_titel"><a\s+href="([^"]+)"\s+class="csslink_PDF"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const title = decodeHtmlEntities((linkMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!/Amtsblatt/i.test(title)) continue;

    // Parse date: e.g. "Amtsblatt_Jg._27_Nr. 1 vom 16. März 2024" or "Amtsblatt Jahrgang 28 - 2025"
    let publishedAt: string | undefined;
    const longMatch = title.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
    if (longMatch) {
      const mm = GERMAN_MONTHS_FULL[longMatch[2]!];
      if (mm) publishedAt = `${longMatch[3]}-${mm}-${longMatch[1]!.padStart(2, "0")}T00:00:00.000Z`;
    }
    if (!publishedAt) {
      const yearOnly = title.match(/(\d{4})/);
      if (yearOnly) publishedAt = `${yearOnly[1]}-01-01T00:00:00.000Z`;
      else continue;
    }

    const mfid = mfidMatch[1]!;
    const id = `${SLUG}-amtsblatt-${mfid}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const href = linkMatch[1]!.replace(/&amp;/g, "&");
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Same dokumente structure but on Bekanntmachungen page; no date in the listing.

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div class="dokumente[^"]*" data-ikiss-mfid="6\.2779\.)/)
    .filter((b) => b.startsWith('<div class="dokumente'));

  for (const block of blocks) {
    const mfidMatch = block.match(/data-ikiss-mfid="6\.2779\.(\d+)\.1"/);
    if (!mfidMatch) continue;
    const linkMatch = block.match(/<div class="liste_titel"><a\s+href="([^"]+)"\s+class="csslink_PDF"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const title = decodeHtmlEntities((linkMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const mfid = mfidMatch[1]!;
    const id = `${SLUG}-notice-${mfid}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const href = linkMatch[1]!.replace(/&amp;/g, "&");
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    // publishedAt not available; use fetchedAt as placeholder
    items.push({ id, title, url, publishedAt: now, fetchedAt: now });
  }
  return items;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt, publishedAt: byId.get(n.id)?.publishedAt ?? n.publishedAt });
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

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
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
assertAllowed(robots, ["/Rathaus/Presseservice/", "/B%C3%BCrger/Veranstaltungen/", "/Rathaus/Amtliche-Informationen/"]);

const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetchText(NEWS_URL),
  fetchText(EVENTS_URL),
  fetchTextOptional(AMTSBLATT_URL),
  fetchTextOptional(NOTICES_URL),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
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

void KOMMUNE_ID; // referenced for documentation
