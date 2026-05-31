#!/usr/bin/env tsx
/**
 * Scraper für Lübbenau/Spreewald (PortUNA + .com Tourismusportal Mouse Calendar).
 *
 * News:             https://www.luebbenau-spreewald.de/news/index.php?rubrik=1
 *                   + Archiv-Seiten /news/index.php?bis=YYYY-MM-01 (Monat-für-Monat, 36 Monate zurück)
 * Bekanntmachungen+Amtsblatt:
 *                   https://www.luebbenau-spreewald.de/bekanntmachungen
 *                   - Tabelle: <h5><a href="PDF" title="X">TITLE</a></h5><p>Veröffentlicht am DD.MM.YYYY/...
 *                   - Drei Abschnitte: aktuelle Bekanntmachungen, Bekanntmachungen Dritter, Amtsblatt-Archiv
 *                   - Amtsblatt-Titel beginnen mit "Amtsblatt" → in amtsblatt.json
 *                   - Rest → notices.json
 * Events:           https://www.luebbenau-spreewald.com/natur-und-freizeit-/veranstaltungen-/veranstaltungskalender
 *                   - Tourismusportal, Mouse Calendar Modul → `var jsevents = [...]` JSON-Array
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.luebbenau-spreewald.de";
const TOURISM_BASE = "https://www.luebbenau-spreewald.com";
const SLUG = "luebbenau-spreewald";
const NEWS_URL = `${BASE_URL}/news/index.php?rubrik=1`;
const NEWS_ARCHIVE_URL = (bis: string) => `${BASE_URL}/news/index.php?archiv=1&rubrik=1&bis=${bis}`;
const BEKANNT_URL = `${BASE_URL}/bekanntmachungen`;
const EVENTS_URL = `${TOURISM_BASE}/natur-und-freizeit-/veranstaltungen-/veranstaltungskalender`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&ndash;/g, "–")
    .replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&#8203;/g, "").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// ── News ──────────────────────────────────────────────────────────────────────
// Aktuelle Seite (Kacheln): <li class="news-entry-to-limit"><h3><a href="/news/1/{ID}/...">TITLE</a></h3><p class="vorschau_text">DD.MM.YYYY: ...</p></li>
// Archiv-Seite (monatlich): <h4 class="title_archive_19">DD.MM.YYYY</h4><ul><li><a href="/news/1/{ID}/...">TITLE</a></li></ul>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Kachel-Variante: news-entry-to-limit mit Datum in vorschau_text
  const tileRe = /<li[^>]*class="news-entry-to-limit[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = tileRe.exec(html)) !== null) {
    const block = m[1]!;
    const linkMatch = block.match(/<h3[^>]*>\s*<a href="(\/news\/\d+\/(\d+)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const newsId = linkMatch[2]!;
    const title = stripTags(linkMatch[3] ?? "");
    if (!title) continue;
    const id = `${SLUG}-news-${newsId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const dateMatch = block.match(/(\d{1,2})\.&#8203;(\d{1,2})\.&#8203;(\d{4})/)
      ?? block.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const publishedAt = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[1]!.padStart(2, "0")}T00:00:00.000Z`
      : undefined;
    items.push({ id, title, url: `${BASE_URL}${href}`, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  // Archiv-Variante: Datum als <h4>, danach <ul><li><a></a></li>... wiederholt bis nächstes <h4>
  const archiveSegRe = /<h4[^>]*class="title_archive_[^"]*"[^>]*>(\d{1,2}\.\d{1,2}\.\d{4})<\/h4>([\s\S]*?)(?=<h4[^>]*class="title_archive_|<\/div>\s*<\/div>\s*<\/div>)/gi;
  let s: RegExpExecArray | null;
  while ((s = archiveSegRe.exec(html)) !== null) {
    const dateStr = s[1]!;
    const dm = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!dm) continue;
    const publishedAt = `${dm[3]}-${dm[2]!.padStart(2, "0")}-${dm[1]!.padStart(2, "0")}T00:00:00.000Z`;
    const segment = s[2]!;
    const linkRe = /<a href="(\/news\/\d+\/(\d+)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let l: RegExpExecArray | null;
    while ((l = linkRe.exec(segment)) !== null) {
      const href = l[1]!;
      const newsId = l[2]!;
      const title = stripTags(l[3] ?? "");
      if (!title) continue;
      const id = `${SLUG}-news-${newsId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now, updatedAt: now });
    }
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Bekanntmachungen + Amtsblatt ──────────────────────────────────────────────
// Pattern pro Eintrag: <h5><a href="PDF" title="...">TITLE</a></h5><p class="tiny_p">Veröffentlicht am DD.MM.YYYY/ Größe ...</p>
interface DocItem { title: string; url: string; publishedAt: string }

function extractDocuments(html: string): DocItem[] {
  const items: DocItem[] = [];
  const seenUrls = new Set<string>();

  // Bekanntmachungen (Tabelle): <h5><a href="PDF" title="X">TITLE</a></h5><p>Veröffentlicht am DD.MM.YYYY/...</p>
  const bekRx = /<h5>\s*<a\s+href="(https?:\/\/[^"]+\.pdf)"\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/a>[^<]*<\/h5>\s*<p[^>]*>([\s\S]*?Ver(?:&ouml;|ö)ffentlicht am[^<]*)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = bekRx.exec(html)) !== null) {
    const url = m[1]!;
    if (seenUrls.has(url)) continue;
    const title = stripTags(m[3] ?? "") || decodeHtmlEntities(m[2]!);
    const meta = decodeHtmlEntities(m[4] ?? "");
    const dm = meta.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!dm) continue;
    const publishedAt = `${dm[3]}-${dm[2]!.padStart(2, "0")}-${dm[1]!.padStart(2, "0")}T00:00:00.000Z`;
    seenUrls.add(url);
    items.push({ title, url, publishedAt });
  }

  // Amtsblatt-Archiv (Accordion): <p><a href="PDF" title="…"> Nummer NN (DD.MM.YYYY)</a></p>
  const amtsRx = /<a\s+href="(https?:\/\/[^"]+\.pdf)"[^>]*>\s*Nummer\s+(\d+)\s*\((\d{1,2})\.(\d{1,2})\.(\d{4})\)/gi;
  let a: RegExpExecArray | null;
  while ((a = amtsRx.exec(html)) !== null) {
    const url = a[1]!;
    if (seenUrls.has(url)) continue;
    const nr = a[2]!.padStart(2, "0");
    const year = a[5]!;
    const publishedAt = `${year}-${a[4]!.padStart(2, "0")}-${a[3]!.padStart(2, "0")}T00:00:00.000Z`;
    seenUrls.add(url);
    items.push({
      title: `Amtsblatt Nr. ${nr}/${year}`,
      url,
      publishedAt,
    });
  }

  return items;
}

function partitionDocs(docs: DocItem[]): { amtsblatt: AmtsblattItem[]; notices: NoticeItem[] } {
  const now = new Date().toISOString();
  const amtsblatt: AmtsblattItem[] = [];
  const notices: NoticeItem[] = [];
  for (const d of docs) {
    const slugBase = (d.url.split("/").pop() ?? "").replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
    if (/^Amtsblatt\b/i.test(d.title)) {
      amtsblatt.push({
        id: `${SLUG}-amtsblatt-${slugBase}`,
        title: d.title,
        url: d.url,
        publishedAt: d.publishedAt,
        fetchedAt: now,
      });
    } else {
      notices.push({
        id: `${SLUG}-notice-${slugBase}`,
        title: d.title,
        url: d.url,
        publishedAt: d.publishedAt,
        fetchedAt: now,
      });
    }
  }
  return {
    amtsblatt: amtsblatt.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    notices: notices.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  };
}

// ── Events (Tourismusportal .com — Mouse Calendar JS-Variable) ────────────────
// `var jsevents = [{...}, ...];` als JSON-Array eingebettet im HTML
interface JsEvent {
  post_id: number; section_id?: number;
  date_start: string; date_end: string;
  time_start?: string; time_end?: string;
  event_title: string; event_description?: string;
  event_organizer?: string; event_address?: string; event_place?: string;
  url_detail?: string;
}

function extractEventsFromJs(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const m = html.match(/var\s+jsevents\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) return items;

  let data: JsEvent[];
  try { data = JSON.parse(m[1]!); } catch { return items; }

  const parseDate = (d: string, t?: string): string | null => {
    const dm = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dm) return null;
    const time = t && /^\d{2}:\d{2}:\d{2}$/.test(t) ? t : "00:00:00";
    return `${dm[3]}-${dm[2]}-${dm[1]}T${time}.000Z`;
  };

  for (const ev of data) {
    if (!ev.post_id || !ev.date_start) continue;
    const id = `${SLUG}-event-${ev.post_id}-${ev.date_start.replace(/\./g, "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const startDate = parseDate(ev.date_start, ev.time_start);
    if (!startDate) continue;
    const endDate = ev.date_end && ev.date_end !== ev.date_start
      ? parseDate(ev.date_end, ev.time_end ?? ev.time_start)
      : null;
    const title = decodeHtmlEntities(ev.event_title || "").trim();
    if (!title) continue;
    const description = ev.event_description ? stripTags(ev.event_description).slice(0, 1000) : undefined;
    const location = ev.event_place || ev.event_address;
    items.push({
      id, title,
      url: ev.url_detail ?? EVENTS_URL,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location: decodeHtmlEntities(location).trim() } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Merge ─────────────────────────────────────────────────────────────────────
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
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/bekanntmachungen"]);

const headers = { "User-Agent": AMTSFEED_UA };

// News-Archive: 12 Monate zurück; jeden Monat ein eigener Request
// Höhere Werte führen zu ECONNREFUSED durch Server-seitiges Rate-Limit
const archiveMonths: string[] = [];
const today = new Date();
for (let i = 1; i <= 12; i++) {
  const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
  archiveMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
}

// Hauptseiten zuerst (3 parallel), dann Archiv-Monate in Batches á 4 (sonst ECONNREFUSED)
const [currentNewsHtml, bekanntHtml, eventsHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(BEKANNT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);
const archiveHtmls: string[] = [];
const CONC = 4;
for (let i = 0; i < archiveMonths.length; i += CONC) {
  const batch = archiveMonths.slice(i, i + CONC);
  const pages = await Promise.all(
    batch.map((bis) => fetch(NEWS_ARCHIVE_URL(bis), { headers })
      .then((r) => r.ok ? r.text() : "")
      .catch(() => "")
    )
  );
  archiveHtmls.push(...pages);
}
const allNewsHtml = [currentNewsHtml, ...archiveHtmls].join("\n");

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const docs = extractDocuments(bekanntHtml);
const { amtsblatt: newAmtsblatt, notices: newNotices } = partitionDocs(docs);

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(allNewsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEventsFromJs(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, newAmtsblatt);
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, newNotices);

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
