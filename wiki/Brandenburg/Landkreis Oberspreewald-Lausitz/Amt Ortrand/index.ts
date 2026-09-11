#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://amt-ortrand.de";
const NEWS_API = `${BASE_URL}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc&_fields=id,date,slug,link,title,excerpt`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblaetter/`;
// Der JEvents-Veranstaltungskalender (/veranstaltungen) ist beim Wechsel von Joomla auf
// WordPress entfallen — es gibt nur noch den Sitzungskalender. events.json bleibt als
// Archiv bestehen, wird aber nicht mehr fortgeschrieben.
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Amtsblatt-Übersicht: <a href="…/September-2026.pdf">Amtsblatt Nr. 9 – September – 05.09.2026</a>
// Die ID wird aus dem Erscheinungsdatum gebildet (ortrand-amtsblatt-YYYY-MM), damit sie mit den
// Einträgen aus der Joomla-Zeit zusammenfällt und der Merge keine Dubletten erzeugt.
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a[^>]*href="([^"]*\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = new URL(m[1]!, BASE_URL).toString();
    const title = decodeHtmlEntities(stripHtml(m[2] ?? ""));
    if (!/amtsblatt|sonderblatt/i.test(title)) continue;

    const dateMatch = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) continue;
    const [, dd, mm, yyyy] = dateMatch;
    const publishedAt = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;

    const id = `ortrand-amtsblatt-${yyyy}-${mm}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    const old = byId.get(n.id);
    byId.set(n.id, old ? { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt } : n);
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) {
    const old = byId.get(a.id);
    byId.set(a.id, old ? { ...a, fetchedAt: old.fetchedAt ?? a.fetchedAt } : a);
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/wp-json/wp/v2/posts", "/amtsblaetter/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const now = new Date().toISOString();

const [postsRaw, amtsblattHtml] = await Promise.all([
  fetch(NEWS_API, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_API}`); return r.json() as Promise<Record<string, unknown>[]>; }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const newsItems: NewsItem[] = postsRaw.map((p) => {
  const description = decodeHtmlEntities(stripHtml((p["excerpt"] as { rendered?: string })?.rendered ?? ""));
  return {
    id: `ortrand-news-${String(p["slug"] ?? p["id"])}`,
    title: decodeHtmlEntities(stripHtml((p["title"] as { rendered?: string })?.rendered ?? "")),
    url: String(p["link"] ?? ""),
    ...(description ? { description } : {}),
    publishedAt: p["date"] ? `${String(p["date"]).replace(" ", "T")}.000Z` : null,
    fetchedAt: now,
    updatedAt: now,
  };
}).filter((n) => n.title && n.url);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, newsItems);
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
