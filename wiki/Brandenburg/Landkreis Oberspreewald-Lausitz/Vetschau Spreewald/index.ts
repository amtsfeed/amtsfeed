#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

// Vetschau (Spreewald) — CMS CONTENIDO 4.10, hosted on stadt.vetschau.de
// www.vetschau.de redirects to https://stadt.vetschau.de/cms/

const BASE_URL = "https://stadt.vetschau.de";
const SLUG = "vetschau-spreewald";
const NEWS_URL = `${BASE_URL}/startseite/nachrichten/`;
const EVENTS_URL = `${BASE_URL}/startseite/veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/highlights/vetschauer-mittteilungsblatt-und-amtsblatt.html`;
const NOTICES_URL = `${BASE_URL}/startseite/wahlen/wahlbekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–").replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function slugFromUrl(url: string): string {
  const m = url.match(/\/([^/]+)\.html$/);
  return m ? m[1]! : url;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Listing has <h3>Title</h3>...<p>Teaser</p>...<a class="more" href="URL">mehr</a>
// No date in listing.

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  // Capture title + URL pair from <h3>...</h3> followed by <a class="more" href="...">
  const rx = /<h3>([\s\S]*?)<\/h3>[\s\S]{0,800}?<a\s+class="more"\s+href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const title = decodeHtmlEntities((m[1] ?? "").replace(/<[^>]+>/g, "").trim());
    const url = m[2]!;
    if (!title || !url.includes("/nachrichten/")) continue;
    const id = `${SLUG}-news-${slugFromUrl(url)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url, fetchedAt: now, updatedAt: now });
  }
  return items;
}

// ── Events ────────────────────────────────────────────────────────────────────
// <div class="event">
//   <h2>Title</h2>
//   <ul>
//     <li><strong>am:</strong> DD.MM.YYYY</li>
//     <li><strong>um:</strong> HH:MM Uhr</li>
//     <li><strong>bis</strong> HH:MM Uhr</li>
//     <li><strong>Ort:</strong> Location</li>
//   </ul>
//   <div class="termintext">...<a href="URL...idart=NNN">mehr</a></div>

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/<div class="event\s*">/).slice(1);
  let counter = 0;
  for (const block of blocks) {
    const end = block.indexOf("<!--");
    const slice = end > 0 ? block.slice(0, Math.min(end, 3000)) : block.slice(0, 3000);

    const titleMatch = slice.match(/<h2>([\s\S]*?)<\/h2>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = slice.match(/<strong>am:<\/strong>\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) continue;
    const dd = dateMatch[1]!; const mm = dateMatch[2]!; const yyyy = dateMatch[3]!;

    const timeMatch = slice.match(/<strong>um:<\/strong>\s*(\d{2}:\d{2})\s*Uhr/);
    const endTimeMatch = slice.match(/<strong>bis<\/strong>\s*(\d{2}:\d{2})\s*Uhr/);
    const startDate = timeMatch
      ? `${yyyy}-${mm}-${dd}T${timeMatch[1]}:00.000Z`
      : `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    // bis-Zeit ist nur Endzeit am selben Tag (selten widersprüchlich) – nicht als endDate setzen wenn < startTime
    let endDate: string | undefined;
    if (endTimeMatch && timeMatch && endTimeMatch[1]! > timeMatch[1]!) {
      endDate = `${yyyy}-${mm}-${dd}T${endTimeMatch[1]}:00.000Z`;
    }

    const locMatch = slice.match(/<strong>Ort:<\/strong>\s*([^<]+)/);
    const location = locMatch ? decodeHtmlEntities(locMatch[1]!.trim()) : undefined;

    const idartMatch = slice.match(/idart=(\d+)/);
    const url = idartMatch
      ? `${BASE_URL}/cms/front_content.php?idart=${idartMatch[1]}`
      : EVENTS_URL;

    counter++;
    const eventId = idartMatch ? `idart-${idartMatch[1]}` : `${yyyy}${mm}${dd}-${counter}`;
    const id = `${SLUG}-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id, title, url, startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Yearly listing of PDFs. Filenames like Vetschau_Amtsblatt_YYMM.pdf
// Plus "Mitteilungsblatt" PDFs (Vetschau_Ausgabe_YYMM.pdf) — those are the non-official Stadtteilzeitung.
// We only collect actual Amtsblatt PDFs ("Vetschau_Amtsblatt_*").

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="([^"]*Vetschau_Amtsblatt_(\d{2})(\d{2})\.pdf)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!.startsWith("http") ? m[1]! : `${BASE_URL}${m[1]!.startsWith("/") ? "" : "/"}${m[1]!}`;
    const yy = m[2]!; const mm = m[3]!;
    const yyyy = `20${yy}`;
    const id = `${SLUG}-amtsblatt-${yyyy}-${mm}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const publishedAt = `${yyyy}-${mm}-01T00:00:00.000Z`;
    items.push({ id, title: `Amtsblatt Vetschau ${mm}/${yyyy}`, url, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Wahlbekanntmachungen: PDF links to /cms/upload/downloads/wahlen/...

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rx = /<a\s+href="([^"]*\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  let counter = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!;
    if (!/wahlen|bekanntmach|amtlich/i.test(url)) continue;
    const title = decodeHtmlEntities((m[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    counter++;
    const id = `${SLUG}-notice-${counter}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
    items.push({ id, title, url: fullUrl, publishedAt: now, fetchedAt: now });
  }
  return items;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.fetchedAt ?? "").localeCompare(a.fetchedAt ?? ""));
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

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  // Use URL as stable key since IDs are positional
  const byKey = new Map(existing.map((n) => [n.url, n]));
  for (const n of incoming) {
    if (!byKey.has(n.url)) byKey.set(n.url, n);
    else byKey.set(n.url, { ...n, fetchedAt: byKey.get(n.url)!.fetchedAt, publishedAt: byKey.get(n.url)!.publishedAt });
  }
  return [...byKey.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title))
    .map((n, i) => ({ ...n, id: `${SLUG}-notice-${i + 1}` }));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/startseite/nachrichten/", "/startseite/veranstaltungen/", "/highlights/", "/startseite/wahlen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const fetchHtml = async (url: string, required: boolean): Promise<string> => {
  const r = await fetch(url, { headers });
  if (!r.ok) {
    if (required) throw new Error(`HTTP ${r.status} ${url}`);
    return "";
  }
  return r.text();
};

const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetchHtml(NEWS_URL, true),
  fetchHtml(EVENTS_URL, true),
  fetchHtml(AMTSBLATT_URL, false),
  fetchHtml(NOTICES_URL, false),
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
