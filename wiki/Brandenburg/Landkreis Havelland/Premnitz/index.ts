#!/usr/bin/env tsx
/**
 * Scraper for Stadt Premnitz (PortUNA / VerwaltungsPortal CMS).
 * https://www.premnitz.de
 *
 * News:           /news/rss.xml                     — RSS-Feed
 * Events:         /veranstaltungen/index.php        — event-entry-new-1 (Datum aus URL)
 * Amtsblatt:      kein eigenes Amtsblatt — Stadt Premnitz veröffentlicht nur Bekanntmachungen
 * Bekanntmachungen: /bekanntmachungen/index.php     — PortUNA-Tabelle <td valign="top">DD.MM.YYYY</td> mit PDF-Link
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, NoticesFile, Event, NewsItem, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "premnitz";
const BASE_URL = "https://www.premnitz.de";
const NEWS_RSS_URL = `${BASE_URL}/news/rss.xml`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

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

function unwrapCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

// ── News (RSS) ────────────────────────────────────────────────────────────────
function extractNewsFromRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]!;
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    if (!titleMatch || !linkMatch) continue;

    const rawTitle = decodeHtmlEntities(unwrapCdata(titleMatch[1] ?? "")).trim();
    const title = rawTitle.replace(/^\d{1,2}\.\d{1,2}\.\d{4}:\s*/, "");
    if (!title) continue;
    const url = unwrapCdata(linkMatch[1] ?? "").trim();
    const idMatch = url.match(/[?&]news=(\d+)/);
    const id = `${SLUG}-news-${idMatch ? idMatch[1] : encodeURIComponent(url).slice(0, 50)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubDateMatch) {
      const d = new Date(unwrapCdata(pubDateMatch[1] ?? "").trim());
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
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
    if (!title || title.length < 3 || title.toLowerCase() === "mehr") continue;
    const [, href, eventId, yyyy, mm, dd] = m;
    const id = `${SLUG}-event-${eventId!}-${yyyy}${mm}${dd}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url: `${BASE_URL}${href!}`, startDate: `${yyyy}-${mm}-${dd}T00:00:00.000Z`, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Notices (Bekanntmachungen) ───────────────────────────────────────────────
// PortUNA-Tabelle: <tr><td valign="top">DD.MM.YYYY</td><td>Title</td><td><a href="PDF"></a></td></tr>
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRe = /<tr>\s*<td[^>]*valign="top"[^>]*>([\d.&#;\s]+)<\/td>\s*<td[^>]*valign="top"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*valign="top"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const dateRaw = m[1]!.replace(/&#8203;/g, "").trim();
    const dm = dateRaw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!dm) continue;
    const publishedAt = `${dm[3]}-${dm[2]!.padStart(2, "0")}-${dm[1]!.padStart(2, "0")}T00:00:00.000Z`;
    const title = stripTags(m[2] ?? "");
    if (!title) continue;
    const pdfMatch = (m[3] ?? "").match(/href="(https?:\/\/[^"]+\.pdf)"/i);
    const url = pdfMatch ? pdfMatch[1]! : NOTICES_URL;
    const idBase = pdfMatch
      ? (pdfMatch[1]!.match(/publicizing\/[\d\/]+\/([^/]+?)\.pdf/i)?.[1] ?? pdfMatch[1]!.split("/").pop()!.replace(/\.pdf$/i, ""))
      : `${publishedAt.slice(0, 10)}-${title.slice(0, 30)}`;
    const id = `${SLUG}-notice-${idBase.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80)}`;
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
function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsXml, eventsHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNewsFromRss(newsXml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
