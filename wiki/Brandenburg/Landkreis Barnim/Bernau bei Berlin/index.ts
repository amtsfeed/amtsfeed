#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, AmtsblattFile, Event, NewsItem, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.bernau.de";
const EVENTS_URL = `${BASE_URL}/de/rathaus-service/aktuelles/veranstaltungen.html`;
const NEWS_URL = `${BASE_URL}/de/rathaus-service/aktuelles/stadtnachrichten.html`;
const AMTSBLATT_BASE_URL = `${BASE_URL}/de/rathaus-service/aktuelles/amtsblatt.html`;
const NOTICES_BASE_URL = `${BASE_URL}/de/politik-beteiligung/buergerbeteiligung/bekanntmachungen.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];
  const seen = new Set<string>();

  const blocks = html.split('<div class="eventListItem');
  // Skip the first chunk (before first event)
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;

    // URL and slug from <h2 class="headline"><a href="...">
    const urlMatch = block.match(/<h2\s+class="headline">\s*<a\s+href="([^"]+)"/);
    if (!urlMatch) continue;
    const href = urlMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // ID: extract "artikel-SLUG" part from URL before "-YYYY-MM-DD.html"
    const slugMatch = href.match(/(artikel-[^/]+?)-\d{4}-\d{2}-\d{2}\.html$/);
    const id = slugMatch ? slugMatch[1]! : href.split("/").pop()!.replace(/\.html$/, "");

    // Title: text inside the <a> tag in headline
    const titleMatch = block.match(/<h2\s+class="headline">\s*<a\s+[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());

    // Date from URL: -YYYY-MM-DD.html
    const dateMatch = href.match(/-(\d{4}-\d{2}-\d{2})\.html$/);
    if (!dateMatch) continue;
    const datePart = dateMatch[1]!;

    // Time from <li>HH:MM &ndash; ... Uhr</li> — look in eventData list
    let startDate = `${datePart}T00:00:00.000Z`;
    const timeMatch = block.match(/(\d{2}:\d{2})\s*(?:&ndash;|–|-)/);
    if (timeMatch) {
      startDate = `${datePart}T${timeMatch[1]}:00.000Z`;
    }

    // Location: 3rd <li> in eventData that is not a link
    let location: string | undefined;
    const eventDataMatch = block.match(/<ul\s+class="eventData[^"]*">([\s\S]*?)<\/ul>/);
    if (eventDataMatch) {
      const liMatches = [...eventDataMatch[1]!.matchAll(/<li>([\s\S]*?)<\/li>/g)];
      // 3rd li (index 2) that doesn't contain an <a>
      if (liMatches.length >= 3) {
        const thirdLi = liMatches[2]![1]!;
        if (!thirdLi.includes("<a")) {
          location = decodeHtmlEntities(thirdLi.replace(/<[^>]+>/g, "").trim());
        } else {
          // search for first non-link li starting from index 2
          for (let j = 2; j < liMatches.length; j++) {
            const li = liMatches[j]![1]!;
            if (!li.includes("<a")) {
              location = decodeHtmlEntities(li.replace(/<[^>]+>/g, "").trim());
              break;
            }
          }
        }
      }
    }

    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      title,
      url,
      startDate,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// ── News ──────────────────────────────────────────────────────────────────────

function extractNews(html: string): NewsItem[] {
  const now = new Date().toISOString();
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  const blocks = html.split('<article id="article_');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;

    // ID from article id attribute
    const idMatch = block.match(/^([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    // URL from <h3 class="headline"><a href="...">
    const urlMatch = block.match(/<h3\s+class="headline">\s*<a\s+href="([^"]+)"/);
    if (!urlMatch) continue;
    const href = urlMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // Title
    const titleMatch = block.match(/<h3\s+class="headline">\s*<a\s+[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());

    // Date from <p class="dateText">Weekday, DD. Month YYYY</p>
    const dateMatch = block.match(
      /<p\s+class="dateText">(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s+(\d{1,2})\.\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})<\/p>/
    );
    let publishedAt: string | undefined;
    if (dateMatch) {
      const day = dateMatch[1]!.padStart(2, "0");
      const month = GERMAN_MONTHS[dateMatch[2]!] ?? "01";
      const year = dateMatch[3]!;
      publishedAt = `${year}-${month}-${day}T00:00:00.000Z`;
    }

    if (seen.has(id)) continue;
    seen.add(id);

    news.push({
      id,
      title,
      url,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return news.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return 0;
  });
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // href comes before title in the HTML: <a href="URL" title="Amtsblatt N[/YYYY] vom D. Month [YYYY] runterladen" ...>
  // Two observed formats:
  //   "Amtsblatt 1 vom 26. Januar 2026 runterladen"       (num only, year at end)
  //   "Amtsblatt 2/2025 vom 23. Februar 2025 runterladen" (num/year, year at end)
  //   "Amtsblatt 4/2025 vom 28. April runterladen"        (num/year, no year at end)
  const re = /href="([^"]+)"[^>]*title="Amtsblatt (\d+)(?:\/(\d{4}))? vom (\d+)\. ([^\s"]+)(?:\s+(\d{4}))? runterladen"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, url, num, yearFromNum, day, monthName, yearFromDate] = m as unknown as [string, string, string, string | undefined, string, string, string | undefined];
    const year = yearFromDate ?? yearFromNum;
    if (!year) continue;
    const month = GERMAN_MONTHS[monthName];
    if (!month) continue;
    const publishedAt = `${year}-${month}-${day.padStart(2, "0")}T00:00:00.000Z`;
    const id = `bernau-amtsblatt-${year}-${num.padStart(2, "0")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: url.startsWith("http") ? url : `${BASE_URL}${url}`,
      publishedAt,
      fetchedAt: now,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// Bernau folder-based download_db:
// <a href="https://www.bernau.de/visioncontent/mediendatenbank/SLUG.pdf"
//    title="TITLE runterladen" ...>
//   <span class="fileName">TITLE</span>
// No dates available in HTML; use fetchedAt as publishedAt placeholder.
// ID: slug from PDF URL (filename without extension).

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const re = /href="(https?:\/\/www\.bernau\.de\/visioncontent\/mediendatenbank\/([^"]+\.pdf))"[^>]*title="([^"]+)\s+runterladen"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1]!;
    const slug = m[2]!.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]/gi, "-");
    const id = `bernau-notice-${slug}`.slice(0, 120);
    if (seen.has(id)) continue;
    seen.add(id);

    const title = decodeHtmlEntities(m[3]!.trim());
    if (!title) continue;

    items.push({ id, title, url, publishedAt: now, fetchedAt: now });
  }

  return items;
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt, publishedAt: byId.get(n.id)?.publishedAt ?? n.publishedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
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

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, [
  "/de/rathaus-service/aktuelles/veranstaltungen.html",
  "/de/rathaus-service/aktuelles/stadtnachrichten.html",
  "/de/rathaus-service/aktuelles/amtsblatt.html",
  "/de/politik-beteiligung/buergerbeteiligung/bekanntmachungen.html",
]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattMainHtml, noticesFolder629Html, noticesFolder630Html] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_BASE_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_BASE_URL}`); return r.text(); }),
  fetch(`${NOTICES_BASE_URL}?folder=629`, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(`${NOTICES_BASE_URL}?folder=630`, { headers }).then((r) => r.ok ? r.text() : ""),
]);

// Extract folder IDs from the navigation links (e.g. ?folder=672), take 2 most recent
const folderMatches = [...amtsblattMainHtml.matchAll(/href="[^"]*amtsblatt\.html\?folder=(\d+)"/g)];
const folderIds = [...new Set(folderMatches.map((m) => m[1]!))].slice(0, 2);

const folderHtmls = await Promise.all(
  folderIds.map((id) => {
    const url = `${AMTSBLATT_BASE_URL}?folder=${id}`;
    return fetch(url, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); });
  })
);

const allAmtsblattItems = [...folderHtmls, amtsblattMainHtml].flatMap(extractAmtsblatt);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, allAmtsblattItems);
const allNoticesHtml = noticesFolder629Html + noticesFolder630Html;
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(allNoticesHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
