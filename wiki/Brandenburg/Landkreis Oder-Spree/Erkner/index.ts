#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.erkner.de";
const EVENTS_URL = `${BASE_URL}/freizeit-und-tourismus/stadtgeschichte-und-kultur/veranstaltungskalender.html`;
const NEWS_URL = `${BASE_URL}/rathaus-und-buergerservice/buergerinformationen/aktuelles.html`;
const AMTSBLATT_URL = `${BASE_URL}/rathaus-und-buergerservice/buergerinformationen/amtsblatt.html`;
const NOTICES_URL = `${BASE_URL}/rathaus-und-buergerservice/buergerinformationen/bekanntmachungen.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanLongDate(dateStr: string): string {
  const m = dateStr.trim().match(/(\d{1,2})\.\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (!m) return new Date().toISOString();
  const mm = GERMAN_MONTHS[m[2] ?? ""] ?? "01";
  return `${m[3]}-${mm}-${(m[1] ?? "1").padStart(2, "0")}T00:00:00.000Z`;
}

function parseGermanShortDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// ── Events ────────────────────────────────────────────────────────────────────
// Neos CMS: events embedded as HTML-entity-encoded JSON in data-events attribute
// Fields: id (UUID), title, startDate (ISO+TZ), endDate, location, uri (full URL)

interface ErknerEvent {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  location?: string;
  uri: string;
}

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  const m = html.match(/data-events="([^"]+)"/);
  if (!m) return [];

  let events: ErknerEvent[];
  try {
    const decoded = m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
    events = JSON.parse(decoded) as ErknerEvent[];
  } catch {
    return [];
  }

  return events.map((e) => {
    const startDate = new Date(e.startDate).toISOString();
    const endDate = e.endDate ? new Date(e.endDate).toISOString() : undefined;
    const location = e.location?.trim() || undefined;
    return {
      id: `erkner-event-${e.id}`,
      title: e.title,
      url: e.uri,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    } satisfies Event;
  });
}

// ── News ──────────────────────────────────────────────────────────────────────
// Neos CMS: <a href="URL" class="NewsFilteredList-release ...">
//   <div class="NewsFilteredList-releaseDate">DD.MM.YYYY</div>
//   <h3 class="... NewsFilteredList-releaseTitle">Title</h3>
// Also top section: <a href="URL" class="NewsListItem">
//   <div class="date">DD.MM.YYYY</div><div class="title">Title</div>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  // Main filtered list (387+ items)
  const rx = /<a href="(\/rathaus-und-buergerservice\/buergerinformationen\/aktuelles\/neuigkeiten\/[^"]+)" target="_self" class="NewsFilteredList-release[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const body = m[2]!;

    const dateMatch = body.match(/NewsFilteredList-releaseDate[^>]*>([^<]+)</);
    const publishedAt = dateMatch ? parseGermanShortDate(dateMatch[1]!.trim()) : now;

    const titleMatch = body.match(/NewsFilteredList-releaseTitle[^>]*>([\s\S]*?)<\/h/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const slugMatch = href.match(/\/([^/]+)\.html$/);
    const id = slugMatch ? `erkner-news-${slugMatch[1]!}` : href;

    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title,
      url: `${BASE_URL}${href}`,
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Neos: <span>Amtsblatt NI2026</span>...Erscheinungsdatum: DD. Month YYYY...<a href="...pdf">

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<span>(Amtsblatt (\d+)I(\d{4}))<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[2]!.padStart(2, "0");
    const year = m[3]!;
    const after = html.slice(m.index, m.index + 600);

    const dateMatch = after.match(/Erscheinungsdatum:\s*([^<]+)</);
    const publishedAt = dateMatch
      ? parseGermanLongDate(decodeHtmlEntities(dateMatch[1]!.trim()))
      : `${year}-01-01T00:00:00.000Z`;

    const pdfMatch = after.match(/href="(https?:\/\/[^"]+\.pdf)"/i);
    const url = pdfMatch ? pdfMatch[1]! : AMTSBLATT_URL;

    items.push({
      id: `erkner-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Neos CMS: sections grouped by reference number h3 (e.g. "03I2026")
// Each AccordionItem has UUID id, title, and a PDF download link
// Structure: <h3>NN I YYYY</h3> ... <button id="UUID"><span class="AccordionItem-titleText">Title</span> ... <a href="PDF" class="download">

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Split by reference section headings like "03I2026"
  const sections = html.split(/<h3[^>]*>(\d{2}I\d{4})<\/h3>/);
  for (let i = 1; i < sections.length; i += 2) {
    const ref = sections[i]!; // e.g. "03I2026"
    const sectionHtml = sections[i + 1] ?? "";
    const num = ref.slice(0, 2);
    const year = ref.slice(3);

    // Each AccordionItem: UUID as button id, title in AccordionItem-titleText span, PDF link
    const itemRx = /<button[^>]+id="([a-f0-9-]{36})"[^>]*>[\s\S]*?<span class="AccordionItem-titleText">([\s\S]*?)<\/span>[\s\S]*?<a href="(https?:\/\/[^"]+)" class="download"/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRx.exec(sectionHtml)) !== null) {
      const uuid = m[1]!;
      const id = `erkner-notice-${uuid}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const title = decodeHtmlEntities((m[2] ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
      if (!title) continue;

      const url = m[3]!;
      // publishedAt: use year from reference number (NNI YYYY), default to Jan 1
      const publishedAt = `${year}-${num}-01T00:00:00.000Z`;
      items.push({ id, title, url, publishedAt, fetchedAt: now });
    }
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

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
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/freizeit-und-tourismus/", "/rathaus-und-buergerservice/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
