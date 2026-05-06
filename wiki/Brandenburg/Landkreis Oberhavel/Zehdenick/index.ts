#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.zehdenick.de";
const NEWS_URL = `${BASE_URL}/nachrichten.html`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// TYPO3 accordion structure (no individual URLs, no dates):
// <a href="#collapse-NNNN" class="accordion-toggle ...">Title</a>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s+href="(#collapse-(\d+))"[^>]*class="accordion-toggle[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const collapseId = m[2]!;
    const id = `zehdenick-news-${collapseId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    items.push({ id, title, url: NEWS_URL, fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 layout: year columns
// Links: <a href="fileadmin/ordner_redaktion/dokumente/amtsblaetter/Amtsblaetter_YYYY/Amtsblatt_Zehdenick_YYYY_N[letter].pdf">MonthName</a>
// Year and issue number extracted from file path; month from link text.
// Future months appear as plain text without <a> — skip those.

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const linkRx = /<a\s+href="(fileadmin\/ordner_redaktion\/dokumente\/amtsblaetter\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRx.exec(html)) !== null) {
    const href = lm[1]!;
    const rawText = decodeHtmlEntities((lm[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!rawText) continue;

    // Extract YYYY and issue key from filename: Amtsblatt_Zehdenick_YYYY_N[letter].pdf
    const fileMatch = href.match(/Amtsblatt_Zehdenick_(\d{4})_(\d+[a-z]?)\.pdf$/i);
    if (!fileMatch) continue;
    const year = fileMatch[1]!;
    const issueKey = fileMatch[2]!;

    // Extract month from link text (e.g. "Januar", "Sonderamtsblatt Februar", "Oktober II")
    const monthMatch = Object.keys(GERMAN_MONTHS).find((m) => rawText.includes(m));
    if (!monthMatch) continue;
    const mm = GERMAN_MONTHS[monthMatch]!;

    const id = `zehdenick-amtsblatt-${year}-${issueKey}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const isSonder = rawText.toLowerCase().includes("sonder");
    const title = isSonder
      ? `Sonderamtsblatt ${monthMatch} ${year}`
      : rawText.includes(" II")
      ? `Amtsblatt ${monthMatch} II ${year}`
      : `Amtsblatt ${monthMatch} ${year}`;

    const publishedAt = `${year}-${mm}-01T00:00:00.000Z`;
    const url = `${BASE_URL}/${href}`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt }); }
  }
  return [...byId.values()];
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
assertAllowed(robots, ["/nachrichten.html", "/amtsblatt.html"]);

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
