#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.oberkraemer.de";
const NEWS_URL = `${BASE_URL}/news/`;
const AMTSBLATT_URL = `${BASE_URL}/buergerservice/downloads/amtsblatt/`;
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

// TYPO3 custom news/events page:
// <h2 class="second_font event_title">
//   <a class="readmore second_font" href="/artikel-ansicht/show/[slug]/">Title</a>
// </h2>
// <i class="fa fa-fw fa-clock-o mr-1"></i>DD.MM.YYYY

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<h2\s[^>]*event_title)/).filter((b) => /artikel-ansicht\/show\//.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/artikel-ansicht\/show\/([^/"]+)\/?)"[^>]*>([\s\S]*?)<\/a>/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const slug = hrefMatch[2]!;
    const id = `oberkraemer-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities((hrefMatch[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/fa-clock-o[^>]*>[\s\S]{0,30}?(\d{2})\.(\d{2})\.(\d{4})/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    items.push({ id, title, url: `${BASE_URL}${href}`, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin — date in `title` attribute as "vom DD.MM.YYYY":
// <a href="/fileadmin/files/06_Service/Amtsblatt/..." title="Amtsblatt Nr. N - Jahrgang NN - vom DD.MM.YYYY">
// 2026+ may use title "Oberkrämer 'Sieben Orte' Nr. N YYYY" with no date → fallback to Jan 1st of year.

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s+href="(\/fileadmin\/files\/06_Service\/Amtsblatt\/[^"]+\.pdf)"[^>]*title="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const titleAttr = decodeHtmlEntities(m[2]!.trim());

    const filename = href.split("/").pop()!.replace(".pdf", "");
    const id = `oberkraemer-amtsblatt-${filename.slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Primary: "vom DD.MM.YYYY" in title attribute
    const dateMatch = titleAttr.match(/vom\s+(\d{2})\.(\d{2})\.(\d{4})/);
    let publishedAt: string;
    if (dateMatch) {
      publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    } else {
      // Fallback: year from title or filename
      const yearMatch = titleAttr.match(/(\d{4})/) ?? href.match(/(\d{4})/);
      publishedAt = yearMatch ? `${yearMatch[1]}-01-01T00:00:00.000Z` : new Date().toISOString();
    }

    const url = `${BASE_URL}${href}`;
    items.push({ id, title: titleAttr, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
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
assertAllowed(robots, ["/news/", "/artikel-ansicht/", "/buergerservice/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);

const amtsblattPath = join(DIR, "amtsblatt.json");
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
