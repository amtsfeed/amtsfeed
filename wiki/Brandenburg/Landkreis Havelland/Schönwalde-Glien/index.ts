#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Schönwalde-Glien (ionas4 CMS).
 * https://www.schoenwalde-glien.de
 *
 * News:             /de/rathaus-service/aktuelles/presse/        — article-teaser__wrapper (news-index-item)
 * Events:           /de/kalender/events.json                     — JSON-Endpoint des TVM-Kalenders
 * Amtsblatt:        /de/rathaus-service/aktuelles/amtsblatt/     — :initial-download-items JSON im downloadsFilterable-Component
 * Bekanntmachungen: /de/rathaus-service/aktuelles/bekanntmachungen/ — article-teaser__wrapper
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "schoenwalde-glien";
const BASE_URL = "https://www.schoenwalde-glien.de";
const NEWS_URL = `${BASE_URL}/de/rathaus-service/aktuelles/presse/`;
const EVENTS_JSON_URL = `${BASE_URL}/de/kalender/events.json?weekends=false&tagMode=ALL`;
const AMTSBLATT_URL = `${BASE_URL}/de/rathaus-service/aktuelles/amtsblatt/`;
const NOTICES_URL = `${BASE_URL}/de/rathaus-service/aktuelles/bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// ── News & Bekanntmachungen (gleiches Teaser-Schema) ─────────────────────────
function extractArticleTeasers(html: string, kind: "news" | "notice"): Array<NewsItem | NoticeItem> {
  const items: Array<NewsItem | NoticeItem> = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Articles starten mit class="...article-teaser..." und enthalten <a href="..." class="article-teaser__wrapper ...">
  const blocks = html.split(/(?=<article[^>]*class="[^"]*article-teaser[^"]*news-index-item)/)
    .filter((b) => b.includes("article-teaser__wrapper"));

  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="([^"]+)"\s+class="article-teaser__wrapper/);
    if (!hrefMatch) continue;
    const url = hrefMatch[1]!;

    const headlineMatch = block.match(/<span\s+class="headline">([\s\S]*?)<\/span>/i);
    const title = stripTags(headlineMatch?.[1] ?? "");
    if (!title) continue;

    const timeMatch = block.match(/<time\s+datetime="([^"]+)"/);
    let publishedAt: string | undefined;
    if (timeMatch) {
      const d = new Date(timeMatch[1]!);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
    const id = `${SLUG}-${kind}-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    if (kind === "news") {
      items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
    } else {
      items.push({ id, title, url, publishedAt: publishedAt ?? now, fetchedAt: now });
    }
  }
  return items;
}

// ── Events (JSON) ────────────────────────────────────────────────────────────
interface CalEvent {
  id: string;
  start: string;
  end?: string;
  allDay?: boolean;
  title: string;
  location?: { name?: string };
}

function extractEvents(jsonText: string): Event[] {
  let parsed: CalEvent[];
  try { parsed = JSON.parse(jsonText) as CalEvent[]; } catch { return []; }
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const ev of parsed) {
    if (!ev.start || !ev.title) continue;
    const eventId = ev.id.replace(/:/g, "-");
    const id = `${SLUG}-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const startIso = new Date(ev.start).toISOString();
    const endIso = ev.end ? new Date(ev.end).toISOString() : undefined;

    items.push({
      id, title: ev.title,
      url: `${BASE_URL}/de/kultur-tourismus/veranstaltungen/`,
      startDate: startIso,
      ...(endIso ? { endDate: endIso } : {}),
      ...(ev.location?.name ? { location: ev.location.name } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt (Embedded JSON in :initial-download-items) ─────────────────────
interface DownloadItem {
  fileName?: string;
  filePathName?: string;
  downloadHref?: string;
  title?: string;
  fileCreatedTimestamp?: number;
  lastModified?: string;
  fileCreated?: string;
}

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const compRe = /:initial-download-items="(\[[\s\S]*?\])"/g;
  let cm: RegExpExecArray | null;
  while ((cm = compRe.exec(html)) !== null) {
    const escaped = cm[1]!;
    // Vue v-bind: HTML-Attribute escapen " als &quot; – wir dekodieren das.
    const jsonStr = escaped
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    let arr: DownloadItem[];
    try { arr = JSON.parse(jsonStr) as DownloadItem[]; } catch { continue; }

    for (const d of arr) {
      const href = d.downloadHref;
      if (!href) continue;
      const fname = d.fileName ?? d.title ?? "";
      if (!/amtsblatt/i.test(fname)) continue;

      // Filename pattern: "Amtsblatt der Gemeinde Schönwalde-Glien Nr. NN JG YY.pdf"
      const nrJgMatch = fname.match(/Nr\.\s*(\d+)\s+JG\s+(\d+)/i);
      let id: string;
      let title: string;
      let publishedAt: string;
      if (nrJgMatch) {
        const nr = nrJgMatch[1]!.padStart(2, "0");
        const jg = nrJgMatch[2]!;
        id = `${SLUG}-amtsblatt-jg${jg}-${nr}`;
        title = `Amtsblatt Nr. ${nr}/JG ${jg}`;
      } else {
        const slug = (d.filePathName ?? fname).replace(/\.pdf$/i, "").slice(0, 60);
        id = `${SLUG}-amtsblatt-${slug}`;
        title = fname.replace(/\.pdf$/i, "");
      }

      if (d.fileCreatedTimestamp) {
        publishedAt = new Date(d.fileCreatedTimestamp).toISOString();
      } else if (d.lastModified) {
        // "18.05.2026, 08:47"
        const m = d.lastModified.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        publishedAt = m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : now;
      } else {
        publishedAt = now;
      }

      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, title, url: href, publishedAt, fetchedAt: now });
    }
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
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
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) {
    const old = byId.get(i.id);
    byId.set(i.id, old ? { ...i, fetchedAt: old.fetchedAt, publishedAt: old.publishedAt } : i);
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/de/rathaus-service/aktuelles/", "/de/kultur-tourismus/", "/de/kalender/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsJson, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_JSON_URL, { headers }).then((r) => r.ok ? r.text() : "[]"),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractArticleTeasers(newsHtml, "news") as NewsItem[]);
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsJson));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractArticleTeasers(noticesHtml, "notice") as NoticeItem[]);

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
