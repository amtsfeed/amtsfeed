#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, Event, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-schlieben.de";
const NOTICES_URL = `${BASE_URL}/verwaltung/service/veroeffentlichungen/`;
const EVENTS_URL = `${BASE_URL}/tourismus/kultur/termine/`;
const DIR = dirname(fileURLToPath(import.meta.url));

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

function extractNotices(html: string, pageUrl: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  // Pattern: date<br /><strong>TITLE<br /></strong>
  // Optional anchor: <a name="ANCHOR"></a>
  const rx = /(?:<a\s+name="([^"]+)"><\/a>\s*)?(\d{2}\.\d{2}\.\d{4})<br\s*\/?><strong>([\s\S]*?)<\/strong>/g;
  let m: RegExpExecArray | null;
  const seen = new Map<string, number>();
  while ((m = rx.exec(html)) !== null) {
    const anchor = m[1] ?? "";
    const dateStr = m[2]!;
    const titleRaw = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim());
    if (!titleRaw) continue;
    const dateParts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    // Build ID from anchor or date+title slug
    const titleSlug = titleRaw.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const baseId = anchor || `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}-${titleSlug}`;
    // Handle duplicates
    const count = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, count);
    const id = count > 1 ? `${baseId}-${count}` : baseId;
    const url = anchor ? `${pageUrl}#${anchor}` : pageUrl;
    items.push({ id, title: titleRaw, url, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Custom CMS: <div class="CollapsiblePanelTab"><strong>DD.MM.YYYY[, HH:MM Uhr] |</strong> Title</div>

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<div\s+class="CollapsiblePanelTab"[^>]*>\s*<strong>([\d.,: Uhr|]+)<\/strong>\s*([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const dateTimeStr = (m[1] ?? "").trim();
    const title = decodeHtmlEntities((m[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dm = dateTimeStr.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:,\s*(\d{2}):(\d{2})\s*Uhr)?/);
    if (!dm) continue;
    const [, dd, mm, yyyy, hh, min] = dm;
    const startDate = hh
      ? `${yyyy}-${mm}-${dd}T${hh}:${min!}:00.000Z`
      : `${yyyy}-${mm}-${dd}T00:00:00.000Z`;

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const id = `schlieben-event-${yyyy}${mm}${dd}-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url: EVENTS_URL, startDate, fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/verwaltung/service/", "/tourismus/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [noticesHtml, eventsHtml] = await Promise.all([
  fetch(NOTICES_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NOTICES_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const noticesPath = join(DIR, "notices.json");
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml, NOTICES_URL));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));
console.log(`notices: ${mergedNotices.length} Einträge → ${noticesPath}`);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
console.log(`events:  ${mergedEvents.length} Einträge → ${eventsPath}`);
