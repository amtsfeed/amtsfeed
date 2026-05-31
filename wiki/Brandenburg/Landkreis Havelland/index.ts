#!/usr/bin/env tsx
/**
 * Scraper für den Landkreis Havelland (TYPO3-CMS).
 * https://www.havelland.de
 *
 * News:      /landkreis-verwaltung/presse/pressemitteilungen/  (paginiert /page/N/)
 *            Container: <div class="c-news-list__item">, Datum als deutscher Langtext im <h4>
 * Amtsblatt: /landkreis-verwaltung/presse/amtsblaetter-{YYYY}/   (aktuelles + 2 letzte Jahre)
 *            + /landkreis-verwaltung/presse/amtsblatt/2023/      (Übergangsjahr)
 *            + /landkreis-verwaltung/presse/amtsblatt/archiv/amtsblaetter-{YYYY}/  (Archiv 2000-2022)
 *            Linktext-Pattern: "Amtsblatt NN/YYYY (DD. Monat)" → Datum aus Linktext
 *
 * Events:    Keine LK-eigene Veranstaltungsseite (404 unter /presse/veranstaltungen/).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../scripts/robots.ts";

const SLUG = "lk-havelland";
const BASE_URL = "https://www.havelland.de";
const NEWS_URL = `${BASE_URL}/landkreis-verwaltung/presse/pressemitteilungen/`;
const AMTSBLATT_CURRENT_URL = (y: number) => `${BASE_URL}/landkreis-verwaltung/presse/amtsblaetter-${y}/`;
const AMTSBLATT_2023_URL = `${BASE_URL}/landkreis-verwaltung/presse/amtsblatt/2023/`;
const AMTSBLATT_ARCHIVE_URL = (y: number) => `${BASE_URL}/landkreis-verwaltung/presse/amtsblatt/archiv/amtsblaetter-${y}/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const MONTHS: Record<string, string> = {
  januar: "01", februar: "02", "märz": "03", maerz: "03", april: "04", mai: "05",
  juni: "06", juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseLongGermanDate(raw: string): string | null {
  // "29. Mai 2026" or "05. Mai 2026"
  const m = raw.trim().match(/^(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[2]!.toLowerCase()] ?? MONTHS[m[2]!.toLowerCase().replace(/ä/g, "ae")];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
}

// ── News ──────────────────────────────────────────────────────────────────────
// <div class="c-news-list__item">
//   <h4>DD. Monatsname YYYY</h4>
//   <a title="..." href="/landkreis-verwaltung/presse/pressemitteilungen/einzelansicht/news/detail/article/SLUG/">
//     <h3>TITEL</h3>
//   </a>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<div\s+class="c-news-list__item[^"]*"[^>]*>([\s\S]*?)<\/h3><\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const block = m[1]!;
    const dateMatch = block.match(/<h4>([^<]+)<\/h4>/);
    const linkMatch = block.match(/<a\s+title="([^"]+)"\s+href="(\/landkreis-verwaltung\/presse\/pressemitteilungen\/einzelansicht\/news\/detail\/article\/([^/]+)\/)"/);
    if (!linkMatch) continue;
    const title = decodeHtmlEntities(linkMatch[1]!);
    if (!title) continue;
    const href = linkMatch[2]!;
    const slug = linkMatch[3]!;
    const publishedAt = dateMatch ? parseLongGermanDate(dateMatch[1]!) : null;

    const id = `${SLUG}-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id, title,
      url: `${BASE_URL}${href}`,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// <a href="/fileadmin/.../Amtsblatt_NN_YYYY.pdf">Amtsblatt NN/YYYY (DD. Monat[ YYYY])</a>
function extractAmtsblatt(html: string, year: number): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // PDF link with surrounding text
  const rx = /<a\s+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    if (!/amtsblatt/i.test(href) && !/amtsblatt/i.test(m[2] ?? "")) continue;
    const text = stripTags(m[2] ?? "");

    // "Amtsblatt 01/2026 (05. Januar)" or "Sonderamtsblatt 02/2026 (12. Januar)"
    const issueMatch = text.match(/(Sonder)?[Aa]mtsblatt\s+(\d+)\/(\d{4})/);
    if (!issueMatch) continue;
    const isSonder = !!issueMatch[1];
    const issueNr = issueMatch[2]!.padStart(2, "0");
    const issueYear = issueMatch[3]!;

    // Datum aus "(DD. Monat)" — Jahr aus issueYear ergänzen wenn fehlt
    const dateMatch = text.match(/\((\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)(?:\s+(\d{4}))?\)/);
    let publishedAt: string;
    if (dateMatch) {
      const dd = dateMatch[1]!.padStart(2, "0");
      const mo = MONTHS[dateMatch[2]!.toLowerCase()];
      const yy = dateMatch[3] ?? issueYear;
      publishedAt = mo ? `${yy}-${mo}-${dd}T00:00:00.000Z` : `${issueYear}-01-01T00:00:00.000Z`;
    } else {
      publishedAt = `${issueYear}-01-01T00:00:00.000Z`;
    }

    const prefix = isSonder ? "sonder-" : "";
    const id = `${SLUG}-amtsblatt-${prefix}${issueYear}-${issueNr}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title: text, url, publishedAt, fetchedAt: now });
  }

  void year;
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
assertAllowed(robots, ["/landkreis-verwaltung/", "/fileadmin/"]);

const headers = { "User-Agent": AMTSFEED_UA };

// News: erste Seite + finde Pagination-Limit
const firstNewsHtml = await fetch(NEWS_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`);
  return r.text();
});
const pageMatches = [...firstNewsHtml.matchAll(/\/pressemitteilungen\/page\/(\d+)\//g)];
const maxPage = pageMatches.length > 0
  ? Math.max(...pageMatches.map((m) => parseInt(m[1]!, 10)))
  : 1;
const additionalPageUrls = Array.from({ length: maxPage - 1 }, (_, i) => `${NEWS_URL}page/${i + 2}/`);
const additionalNewsHtmls = await Promise.all(
  additionalPageUrls.map((u) => fetch(u, { headers }).then((r) => r.ok ? r.text() : ""))
);
const allNewsHtml = [firstNewsHtml, ...additionalNewsHtmls].join("\n");

// Amtsblatt: aktuelles Jahr + 2 Vorjahre als „presse/amtsblaetter-YYYY/", 2023 separat, restl. Archiv 2000-2022
const currentYear = new Date().getFullYear();
const currentAmtsblattUrls = [
  AMTSBLATT_CURRENT_URL(currentYear),
  AMTSBLATT_CURRENT_URL(currentYear - 1),
  AMTSBLATT_CURRENT_URL(currentYear - 2),
];
const archiveYears: number[] = [];
for (let y = 2022; y >= 2000; y--) archiveYears.push(y);
const archiveAmtsblattUrls = archiveYears.map(AMTSBLATT_ARCHIVE_URL);

const amtsblattHtmls = await Promise.all([
  ...currentAmtsblattUrls.map((u) => fetch(u, { headers }).then((r) => r.ok ? r.text() : "")),
  fetch(AMTSBLATT_2023_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  ...archiveAmtsblattUrls.map((u) => fetch(u, { headers }).then((r) => r.ok ? r.text() : "")),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const mergedNews = mergeNews(
  loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items,
  extractNews(allNewsHtml)
);
const allIncomingAmtsblatt: AmtsblattItem[] = [];
for (const html of amtsblattHtmls) allIncomingAmtsblatt.push(...extractAmtsblatt(html, currentYear));
const mergedAmtsblatt = mergeAmtsblatt(
  loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items,
  allIncomingAmtsblatt
);

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
