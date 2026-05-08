#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../scripts/robots.ts";

const BASE_URL = "https://www.lkee.de";
const NEWS_URL = `${BASE_URL}/Aktuelles-Kreistag/`;
const EVENTS_URL = `${BASE_URL}/Soziales-Kultur/Veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/index.php?La=1&object=tx,2112.1066.1&kuo=2&sub=0`;
const DIR = dirname(fileURLToPath(import.meta.url));

// lkee.de uses ISO-8859-15 / windows-1252 encoding
async function fetchDecoded(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  return new TextDecoder("windows-1252").decode(bytes);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// IKISS CMS: <div class="date">DD.MM.YYYY</div><h4><a href="...FID=2112.{ID}.1...">Title</a></h4>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<div class="date">(\d{2})\.(\d{2})\.(\d{4})<\/div>\s*<h4><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h4>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const [, dd, mm, yyyy, href, rawTitle] = m;
    const title = decodeHtmlEntities((rawTitle ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const fidMatch = href!.match(/FID=2112\.(\d+)\.1/);
    const id = `lkee-news-${fidMatch ? fidMatch[1] : encodeURIComponent(href!).slice(0, 50)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const publishedAt = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    const url = href!.startsWith("http") ? href! : `${BASE_URL}${href!}`;
    items.push({ id, title, url: decodeHtmlEntities(url), publishedAt, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// IKISS CMS: <li><h3><a href="...FID=2112.{ID}.1...">Title</a></h3><p>DD.MM.YYYY[ bis DD.MM.YYYY] in Location</p></li>

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Structure: <li><h3><a href="...">Title</a></h3><p></p><p>DD.MM.YYYY[ bis DD.MM.YYYY] in Location<br/>...</p></li>
  const rx = /<li>\s*<h3><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>[\s\S]*?<p>\s*(\d{2})\.(\d{2})\.(\d{4})(?:\s+bis\s+(\d{2})\.(\d{2})\.(\d{4}))?/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const [, href, rawTitle, dd, mm, yyyy, edd, emm, eyyyy] = m;
    const title = decodeHtmlEntities((rawTitle ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const fidMatch = href!.match(/FID=2112\.(\d+)\.1/);
    const id = `lkee-event-${fidMatch ? fidMatch[1] : encodeURIComponent(href!).slice(0, 50)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const startDate = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    const endDate = edd ? `${eyyyy}-${emm}-${edd}T00:00:00.000Z` : undefined;
    const url = href!.startsWith("http") ? href! : `${BASE_URL}${decodeHtmlEntities(href!)}`;
    items.push({ id, title, url, startDate, ...(endDate && endDate !== startDate ? { endDate } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// IKISS CMS grouped by year: <li><a href="/media/custom/2112_{ID}_1.PDF?{unix_ts}">Amtsblatt EE NN-YYYY</a></li>
// Unix timestamp in URL used as publishedAt date

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<li><a[^>]*href="(\/media\/custom\/2112_[^?]+\?(\d+))"[^>]*>((?:Amtsblatt|Kreisanzeiger)[^<]+)<\/a><\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const [, path, tsStr, rawTitle] = m;
    const title = decodeHtmlEntities(rawTitle!.trim());
    const id = `lkee-amtsblatt-${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const publishedAt = new Date(parseInt(tsStr!) * 1000).toISOString().slice(0, 10) + "T00:00:00.000Z";
    const url = `${BASE_URL}${path}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

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
assertAllowed(robots, ["/Aktuelles-Kreistag/", "/Soziales-Kultur/", "/index.php", "/media/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetchDecoded(NEWS_URL, headers),
  fetchDecoded(EVENTS_URL, headers),
  fetchDecoded(AMTSBLATT_URL, headers),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
