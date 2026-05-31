#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Schipkau — PortUNA (verwaltungsportal.de)
 * https://www.gemeinde-schipkau.de
 *
 * Events: PortUNA event-entry-div variant.
 *   <div class="event-entry-div"> with <time datetime="YYYY-MM-DD">,
 *   <h3 ... class="event-title"><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">…</a></h3>,
 *   <address> for location, <span class="vorschau"> for description.
 * News: PortUNA news-entry-to-limit (standard).
 * Amtsblatt: PortUNA table.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.gemeinde-schipkau.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const ID_PREFIX = "schipkau";
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&acute;/g, "´").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(str: string): string {
  return decodeHtmlEntities(str.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// ── Events: PortUNA event-entry-div variant ───────────────────────────────────
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div[^>]*class="event-entry-div")/)
    .filter((b) => b.includes('class="event-entry-div"'));

  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const stableId = linkMatch[2]!;
    const isoDate = `${linkMatch[3]}-${linkMatch[4]}-${linkMatch[5]}`;
    const id = `${ID_PREFIX}-event-${stableId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = `${BASE_URL}${href}`;

    // Title: first link text inside h3
    const titleMatch = block.match(/<h3[^>]*event-title[^>]*>[\s\S]*?<a\s+href="[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleMatch ? stripHtml(titleMatch[1] ?? "") : "";
    if (!title) continue;

    // Location: first <address> in block
    const addrMatch = block.match(/<address[^>]*>([\s\S]*?)<\/address>/i);
    const location = addrMatch ? stripHtml(addrMatch[1] ?? "") || undefined : undefined;

    // Description: <span class="vorschau">… [<a …>mehr</a>]</span> — drop the "[mehr]" tail
    const vorschauMatch = block.match(/<span\s+class="vorschau">([\s\S]*?)<\/span>/i);
    let description: string | undefined;
    if (vorschauMatch) {
      let text = stripHtml(vorschauMatch[1] ?? "");
      text = text.replace(/\s*\[\s*mehr\s*\]\s*$/i, "").trim();
      description = text || undefined;
    }

    events.push({
      id,
      title,
      url,
      startDate: `${isoDate}T00:00:00.000Z`,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News: PortUNA news-entry-to-limit ─────────────────────────────────────────
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit")/)
    .filter((b) => b.includes('class="news-entry-to-limit"'));

  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = stripHtml(titleMatch[2] ?? "");
    if (!title) continue;

    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const stableId = idMatch ? idMatch[1]! : href;
    const id = `${ID_PREFIX}-news-${stableId}`;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const vorschauMatch = block.match(/<p\s+class="vorschau">([\s\S]*?)<\/p>/i);
    let publishedAt: string | undefined;
    let description: string | undefined;
    if (vorschauMatch) {
      const text = stripHtml(vorschauMatch[1] ?? "");
      const dateMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4}):\s*/);
      if (dateMatch) {
        publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
        description = text.slice(dateMatch[0].length).trim() || undefined;
      } else {
        description = text || undefined;
      }
    }

    items.push({
      id,
      title,
      url,
      ...(description ? { description } : {}),
      fetchedAt: now,
      ...(publishedAt ? { publishedAt } : {}),
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
function extractAmtsblatt(html: string, listingUrl: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>Nr\.\s*(\d+)\/(\d{4})<\/td>\s*<td>([\d.&#;]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[1]!.padStart(2, "0");
    const year = m[2]!;
    const dateStr = m[3]!.replace(/&#\d+;/g, "");
    const dp = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dp) continue;
    const publishedAt = `${dp[3]}-${dp[2]}-${dp[1]}T00:00:00.000Z`;
    items.push({
      id: `${ID_PREFIX}-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: listingUrl,
      publishedAt,
      fetchedAt: now,
    });
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
assertAllowed(robots, ["/veranstaltungen/index.php", "/news/1", "/amtsblatt/index.php"]);

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
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml, AMTSBLATT_URL));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
