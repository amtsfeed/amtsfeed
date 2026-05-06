#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, AmtsblattFile, Event, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.gemeinde-schorfheide.de";
const EVENTS_BASE_URL = "https://www.schorfheide.de";
const EVENTS_URL = `${EVENTS_BASE_URL}/veranstaltungen.html`;
const AMTSBLATT_URL = `${BASE_URL}/startseite/aktuell/amtsblatt`;
const NOTICES_URL = `${BASE_URL}/startseite/aktuell/oeffentliche-bekanntmachungen`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Joomla + screendriverFOUR-Events template
// Container: <div class="col-xs-12 eventbox ...">
// Date: <p class="dat"><strong>DD.MM.YYYY</strong> | HH:MM Uhr</p>
// Title: <h3>TITLE</h3> (Schorfheide uses h3 instead of h2)
// Location: <p class="place"><img ...> <strong>LOCATION</strong></p>
// URL: href="/veranstaltungen/eventdetail-laden.html?se=ID"

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString();

  // Split on eventbox class substring to get individual event blocks
  // The actual class is "col-xs-12 eventbox schatten ..."
  const blocks = html.split("eventbox schatten").filter((_, i) => i > 0);

  for (const block of blocks) {
    // Extract event ID from se= parameter
    const idMatch = block.match(/se=(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Extract date: <strong>DD.MM.YYYY</strong>
    const dateMatch = block.match(/<strong>(\d{1,2})\.(\d{1,2})\.(\d{4})<\/strong>/);
    if (!dateMatch) continue;
    const [, day, month, year] = dateMatch;
    const dateStr = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;

    // Extract time: | HH:MM Uhr
    const timeMatch = block.match(/\|\s*(\d{1,2}:\d{2})\s*Uhr/);
    const time = timeMatch ? timeMatch[1]!.padStart(5, "0") : "00:00";
    const startDate = `${dateStr}T${time}:00.000Z`;

    // Extract title from <h2> or <h3>
    const titleMatch = block.match(/<h[23]>([\s\S]*?)<\/h[23]>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Extract location from class="place" block
    const placeMatch = block.match(/class="place"[\s\S]*?<strong>([^<]+)<\/strong>/);
    const location = placeMatch
      ? decodeHtmlEntities(placeMatch[1]!.trim()) || undefined
      : undefined;

    // Extract URL
    const hrefMatch = block.match(/href="([^"]*se=\d+[^"]*)"/);
    const url = hrefMatch ? `${EVENTS_BASE_URL}${hrefMatch[1]!}` : EVENTS_URL;

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

  return events;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// URL: https://www.gemeinde-schorfheide.de/startseite/aktuell/amtsblatt
// Also fetches prev year page: /startseite/aktuell/amtsblatt/amtsblatt-YYYY
// Links: <a href="/fileadmin/...Amtsblatt...\.pdf">Amtsblatt März 2026, Nr. 03/2026 (20.03.2026)</a>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const linkRe = /<a\s+href="(\/fileadmin\/[^"]*[Aa]mtsblatt[^"]*\.pdf)"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1]!;
    const text = decodeHtmlEntities(m[2]!.trim());

    // Extract Nr. NN/YYYY from link text
    const nrMatch = text.match(/Nr\.\s*(\d{2})\/(\d{4})/);
    if (!nrMatch) continue;
    const num = nrMatch[1]!;
    const year = nrMatch[2]!;

    // Extract date from parentheses: (DD.MM.YYYY)
    const dateMatch = text.match(/\((\d{2})\.(\d{2})\.(\d{4})\)/);
    let publishedAt: string;
    if (dateMatch) {
      publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    } else {
      publishedAt = `${year}-${num}-01T00:00:00.000Z`;
    }

    const id = `schorfheide-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: text,
      url: `${BASE_URL}${href}`,
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

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Notices ───────────────────────────────────────────────────────────────────
// gemeinde-schorfheide.de öffentliche Bekanntmachungen:
// <p><strong>DD.MM.YYYY</strong><br>TITLE <a href="/fileadmin/...">(Download)</a></p>
// ID: slug from fileadmin path filename.

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match <p><strong>DD.MM.YYYY</strong><br>TITLE <a href="/fileadmin/...">(Download)</a></p>
  const re = /<p>\s*<strong>(\d{2})\.(\d{2})\.(\d{4})<\/strong>\s*<br\s*\/?>\s*([\s\S]*?)<a\s+href="(\/fileadmin\/[^"]+\.pdf)"[^>]*>\s*\(Download\)\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const day = m[1]!;
    const month = m[2]!;
    const year = m[3]!;
    const titleRaw = (m[4] ?? "").replace(/<[^>]+>/g, "").trim();
    const href = m[5]!;

    const title = decodeHtmlEntities(titleRaw);
    if (!title) continue;

    const publishedAt = `${year}-${month}-${day}T00:00:00.000Z`;
    const filename = decodeURIComponent(href.split("/").pop() ?? href)
      .replace(/\.pdf$/i, "").replace(/[^a-z0-9_\-]/gi, "-").toLowerCase().slice(0, 80);
    const id = `schorfheide-notice-${filename}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url: `${BASE_URL}${href}`, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt, publishedAt: byId.get(n.id)?.publishedAt ?? n.publishedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Main ──────────────────────────────────────────────────────────────────────

// checkRobots for Joomla tourism site (events) and gemeinde site (amtsblatt + notices)
const robotsEvents = await checkRobots(DIR, "https://www.schorfheide.de");
assertAllowed(robotsEvents, ["/veranstaltungen.html"]);

const headers = { "User-Agent": AMTSFEED_UA };

// Fetch events + amtsblatt main page + notices in parallel, then discover prev year amtsblatt page
const [eventsHtml, amtsblattMainHtml, noticesHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

// Find prev year amtsblatt page link
const prevYear = new Date().getFullYear() - 1;
const prevYearMatch = amtsblattMainHtml.match(new RegExp(`href="(/startseite/aktuell/amtsblatt/amtsblatt-${prevYear})"`));
let prevYearHtml = "";
if (prevYearMatch) {
  const prevUrl = `${BASE_URL}${prevYearMatch[1]}`;
  prevYearHtml = await fetch(prevUrl, { headers }).then((r) => r.ok ? r.text() : "");
}

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const allAmtsblattHtml = amtsblattMainHtml + prevYearHtml;
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(allAmtsblattHtml));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

// Write empty news.json if it doesn't exist
if (!existsSync(newsPath)) {
  writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: [] } satisfies NewsFile, null, 2));
}

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       0 Einträge (keine Nachrichten) → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
