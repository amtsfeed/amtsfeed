#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, AmtsblattFile, NewsItem, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.stadt-muencheberg.de";
// Der öffentliche Veranstaltungskalender (/kultur-tourismus/events) wurde im Zuge des
// TYPO3-Umbaus ersatzlos abgeschaltet (liefert 403, taucht in keiner Navigation mehr auf).
// events.json bleibt als Archiv bestehen, wird aber nicht mehr fortgeschrieben.
const NEWS_URL = `${BASE_URL}/startseite`;
const AMTSBLATT_URL = `${BASE_URL}/buerger-stadt/stadtverwaltung/muencheberger-anzeiger-und-nachrichtenblatt`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function slugify(str: string): string {
  return str.toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// ── Events ────────────────────────────────────────────────────────────────────
// Events are a plain HTML text list in the TYPO3 content element.
// Format: <li class="text-justify"><strong>DD.MM.YYYY[[ -|- bis] DD.MM.YYYY][ | ab H:MM Uhr]</strong><br> Title</li>

// ── News ──────────────────────────────────────────────────────────────────────
// News slider on homepage — TYPO3 newsslider extension (EXT:newsslider)
// Container: <a class="card slick-link" href="/path/to/article">
// Date: <time itemprop="datePublished" datetime="YYYY-MM-DD">
// Title: <h5 class="card-title">TITLE</h5>
// ID: last path segment of URL slug

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  const cardBlocks = [...html.matchAll(/<a\s+class="card\s+slick-link"\s+href="([^"]+)">([\s\S]*?)<\/a>/g)];

  for (const m of cardBlocks) {
    const url = `${BASE_URL}${m[1]}`;
    const block = m[2]!;

    const dateMatch = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    const titleMatch = block.match(/<h5\s+class="card-title">([\s\S]*?)<\/h5>/);
    if (!titleMatch) continue;

    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const urlPath = m[1]!;
    const id = urlPath.replace(/\//g, "-").replace(/^-+|-+$/g, "");
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : undefined;

    news.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return news;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin. "Müncheberger Anzeiger" = offizielles Amtsblatt.
// PDF filenames: Muencheberger_Anzeiger_MMMM_YYYY.pdf (no issue number)
//                Muencheberger_Anzeiger_MMMM_YYYY_NN.pdf
//                Muencheberger_Anzeiger_MMMM_Nr_N_YYYY.pdf
// Date = first day of the month (actual date not in HTML).

const FILENAME_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", maerz: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", dezember: "12",
};

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items = new Map<string, AmtsblattItem>();
  const now = new Date().toISOString();

  const rx = /href="(\/fileadmin\/[^"]*Muencheberger_Anzeiger_([^"]+\.pdf))"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const path = m[1]!;
    const namePart = m[2]!.replace(/\.pdf$/i, "").toLowerCase();
    // Extract month and year from filename parts
    const parts = namePart.split("_").filter(Boolean);
    let monthNum: string | undefined;
    let year: string | undefined;
    for (const part of parts) {
      if (FILENAME_MONTHS[part]) monthNum = FILENAME_MONTHS[part];
      if (/^\d{4}$/.test(part)) year = part;
    }
    if (!monthNum || !year) continue;
    const id = `muencheberg-amtsblatt-${year}-${monthNum}`;
    // Keep the latest URL per month (handles _korr variants)
    if (!items.has(id)) {
      items.set(id, {
        id,
        title: `Müncheberger Anzeiger ${monthNum}/${year}`,
        url: `${BASE_URL}${path}`,
        publishedAt: `${year}-${monthNum}-01T00:00:00.000Z`,
        fetchedAt: now,
      });
    }
  }

  return [...items.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}


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
assertAllowed(robots, ["/startseite", "/buerger-stadt/stadtverwaltung/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
