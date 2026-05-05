#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-biesenthal-barnim.de";
const NEWS_URL = `${BASE_URL}/news`;
const AMTSBLATT_BASE = `${BASE_URL}/amtsbl%C3%A4tter-`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mär: "03", Apr: "04", Mai: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Okt: "10", Nov: "11", Dez: "12",
};

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

// ── News ──────────────────────────────────────────────────────────────────────
// Contao CMS: split on <div class="newslist-timeline block
// Date: <div class="newslist-timeline-date">DD. Mon YYYY</div>
// Title/URL: <h4><a href="RELATIVE_URL" ...>TITLE</a></h4>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split('<div class="newslist-timeline block').slice(1);

  for (const block of blocks) {
    const dateMatch = block.match(/<div class="newslist-timeline-date">(\d{1,2})\. ([A-Za-zäöü]+) (\d{4})<\/div>/);
    let publishedAt: string | undefined;
    if (dateMatch) {
      const day = dateMatch[1]!.padStart(2, "0");
      const monthStr = dateMatch[2]!;
      const year = dateMatch[3]!;
      const month = GERMAN_MONTHS[monthStr];
      if (month) {
        publishedAt = `${year}-${month}-${day}T00:00:00.000Z`;
      }
    }

    const linkMatch = block.match(/<h4><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h4>/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const title = decodeHtmlEntities(linkMatch[2]!.trim());
    if (!title) continue;

    // Build absolute URL: remove leading slash if present
    const cleanHref = href.replace(/^\//, "");
    const url = `${BASE_URL}/${cleanHref}`;

    // ID from last path component
    const slugMatch = cleanHref.match(/([^/]+)$/);
    const id = slugMatch ? slugMatch[1]! : cleanHref;

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Contao CMS — per-year pages at /amtsblätter-YYYY
// PDF links: href="amtsblätter-YYYY?file=files/dokumente/pdf-datei-amtsblatt/YYYY/Amtsblatt...pdf"
// Direct PDF URL: BASE_URL + "/" + file path (no auth required)
// Filename patterns: "Amtsblatt NN-YYYY.pdf", "Amtsblatt NN - YYYY.pdf", "Amtsblatt Biesenthal-Barnim_N-YYYY_web.pdf"

function extractAmtsblatt(html: string, year: number): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /\?file=(files\/dokumente\/pdf-datei-amtsblatt\/\d{4}\/[^"]+\.pdf)/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const filePath = decodeURIComponent(m[1]!);
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    const numMatch = filePath.match(/(\d+)\s*[-–]\s*(\d{4})(?:[_\s.])/);
    if (!numMatch) continue;
    const num = numMatch[1]!.padStart(2, "0");
    const fileYear = numMatch[2]!;
    if (String(year) !== fileYear) continue;
    const id = `biesenthal-barnim-amtsblatt-${fileYear}-${num}`;
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${fileYear}`,
      url: `${BASE_URL}/${filePath}`,
      publishedAt: `${fileYear}-${num}-01T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

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
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return 0;
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news", "/amtsbl"]);

const headers = { "User-Agent": AMTSFEED_UA };

const thisYear = new Date().getFullYear();
const prevYear = thisYear - 1;

const [newsHtml, amtsblattHtmlCurrent, amtsblattHtmlPrev] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(`${AMTSBLATT_BASE}${thisYear}`, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(`${AMTSBLATT_BASE}${prevYear}`, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const incomingAmtsblatt = [
  ...extractAmtsblatt(amtsblattHtmlCurrent, thisYear),
  ...extractAmtsblatt(amtsblattHtmlPrev, prevYear),
];

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, incomingAmtsblatt);

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
