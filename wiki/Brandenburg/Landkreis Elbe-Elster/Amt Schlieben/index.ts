#!/usr/bin/env tsx
// Amt Schlieben uses a custom/older CMS with notices listed on specific pages
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-schlieben.de";
const NOTICES_URL = `${BASE_URL}/verwaltung/service/veroeffentlichungen/`;
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
assertAllowed(robots, ["/verwaltung/service/veroeffentlichungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const html = await fetch(NOTICES_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${NOTICES_URL}`);
  return r.text();
});

const noticesPath = join(DIR, "notices.json");
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(html, NOTICES_URL));

const now = new Date().toISOString();
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));
console.log(`notices: ${mergedNotices.length} Einträge → ${noticesPath}`);
