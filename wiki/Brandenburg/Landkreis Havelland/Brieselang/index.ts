#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Brieselang (active-City CMS, ColdFusion).
 * https://www.gemeindebrieselang.de
 *
 * News:        /Aktuelles/Aktuelle-Meldungen.htm   — ac_teaser_item / ac_teaser_link / ac_teaser_date
 * Events:      /Aktuelles/Veranstaltungen.htm      — event_wrapper teaser_element / event_teaser_title_link
 *              (Datum nur als deutscher Wochentag + Monatsname – Jahr fehlt; aus Kontext inferiert)
 * Amtsblatt:   /Rathaus-und-Service/Buergerservice/Amtsblaetter.htm
 *              — Linkliste „Amtsblatt MM/YYYY vom DD. Monatsname YYYY"
 *              — URL-Schema /city_info/display/dokument/show.cfm?region_id=342&id=NNN
 *
 * Besonderheit: Server liefert nur Inhalt mit `Accept-Encoding: gzip`-Header
 * (Node fetch sendet das automatisch beim normalen Aufruf).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "brieselang";
const BASE_URL = "https://www.gemeindebrieselang.de";
const NEWS_URL = `${BASE_URL}/Aktuelles/Aktuelle-Meldungen.htm`;
const EVENTS_URL = `${BASE_URL}/Aktuelles/Veranstaltungen.htm`;
const AMTSBLATT_URL = `${BASE_URL}/Seiten/Amtsblaetter-der-Gemeinde-Brieselang.html`;
// Jahresweise Archivseiten (Format: /Seiten/Amtsblaetter-YYYY.html)
function amtsblattArchiveUrls(): string[] {
  const currentYear = new Date().getFullYear();
  // Letzte 3 Jahre + ausgewählte Archivjahre
  const years: number[] = [];
  for (let y = currentYear - 1; y >= currentYear - 3; y--) years.push(y);
  return years.map((y) => `${BASE_URL}/Seiten/Amtsblaetter-${y}.html`);
}
const DIR = dirname(fileURLToPath(import.meta.url));

const MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04", Mai: "05", Juni: "06",
  Juli: "07", August: "08", September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&#160;/g, " ")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// ── News ──────────────────────────────────────────────────────────────────────
// <div class="ac_teaser_item item_{ID} ..."><a class="ac_teaser_link" href="..." title="...">
//   <h3 class="ac_teaser_title">TITLE</h3>
//   <div class="ac_teaser_date">Datum DD.MM.YYYY</div>
//   <div class="ac_teaser_text"><span class="text_wrapper">TEXT</span></div></a></div>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s+class="ac_teaser_item\s+item_)/).filter((b) => b.includes("ac_teaser_link"));
  for (const block of blocks) {
    const idMatch = block.match(/item_(\d+)/);
    if (!idMatch) continue;
    const itemId = idMatch[1]!;
    const id = `${SLUG}-news-${itemId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const hrefMatch = block.match(/<a[^>]+class="ac_teaser_link"[^>]+href="([^"]+)"/i)
      ?? block.match(/<a[^>]+href="([^"]+)"[^>]+class="ac_teaser_link"/i);
    if (!hrefMatch) continue;
    const href = decodeHtmlEntities(hrefMatch[1]!);
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleMatch = block.match(/<h3\s+class="ac_teaser_title">([\s\S]*?)<\/h3>/i);
    const title = stripTags(titleMatch?.[1] ?? "");
    if (!title) continue;

    let publishedAt: string | undefined;
    const dateMatch = block.match(/<div\s+class="ac_teaser_date">\s*(?:Datum\s+)?(\d{2})\.(\d{2})\.(\d{4})/);
    if (dateMatch) publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const descMatch = block.match(/<span\s+class="text_wrapper">([\s\S]*?)<\/span>/i);
    const description = descMatch ? stripTags(descMatch[1] ?? "") || undefined : undefined;

    items.push({ id, title, url, ...(description ? { description } : {}), ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// <div class="event_wrapper teaser_element">
//   <h5><a class="event_teaser_link event_teaser_title_link" title="..." href="...">TITLE</a>
//     <span class="event_date ...">
//       <span class="event_date_inner_wrapper">
//         [<span class="event_date_from">DAY DD. MONAT </span><span class="event_date_seperator">-</span>]
//         <span class="event_date_to">DAY DD. MONAT </span>
//       </span></span></h5>
//   <span class="event_teaser">TEXT</span>
//
// Achtung: Jahr fehlt im HTML. Wir leiten es heuristisch aus "now" ab: nehmen das nächstgelegene
// Datum in der Zukunft (oder im aktuellen Monat).
function inferYear(day: number, month: number, today: Date): number {
  const candidateThis = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
  // Wenn das Datum mehr als 60 Tage in der Vergangenheit liegt, nutze nächstes Jahr.
  const diffDays = (candidateThis.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < -60) return today.getUTCFullYear() + 1;
  return today.getUTCFullYear();
}

function parseGermanShortDate(raw: string, today: Date): { date: string; year: number } | null {
  // "Sonntag 31. Mai" or "Sonntag 31. Mai 2026"
  const m = raw.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)(?:\s+(\d{4}))?/);
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const monthName = m[2]!;
  const month = MONTHS[monthName];
  if (!month) return null;
  const year = m[3] ? parseInt(m[3], 10) : inferYear(day, parseInt(month, 10), today);
  return { date: `${year}-${month}-${String(day).padStart(2, "0")}`, year };
}

function extractEvents(html: string, today: Date): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s*\n?\s*class="\s*\n?\s*event_wrapper\s+teaser_element)/).filter((b) => b.includes("event_teaser_title_link"));
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]*class="event_teaser_link event_teaser_title_link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = decodeHtmlEntities(linkMatch[1]!);
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const title = stripTags(linkMatch[2] ?? "");
    if (!title) continue;

    const fromMatch = block.match(/<span\s+class="event_date_from">([\s\S]*?)<\/span>/i);
    const toMatch = block.match(/<span\s+class="event_date_to">([\s\S]*?)<\/span>/i);

    const fromText = fromMatch ? stripTags(fromMatch[1] ?? "") : "";
    const toText = toMatch ? stripTags(toMatch[1] ?? "") : "";

    // Some events only have date_to, others both
    const parsedTo = toText ? parseGermanShortDate(toText, today) : null;
    let parsedFrom = fromText ? parseGermanShortDate(fromText, today) : null;

    // If from has no month (e.g. "Freitag 26.") it inherits month from to
    if (!parsedFrom && fromText) {
      const dm = fromText.match(/(\d{1,2})\./);
      if (dm && parsedTo) {
        const day = parseInt(dm[1]!, 10);
        const [y, m] = parsedTo.date.split("-");
        parsedFrom = { date: `${y}-${m}-${String(day).padStart(2, "0")}`, year: parsedTo.year };
      }
    }

    const startIso = (parsedFrom?.date ?? parsedTo?.date);
    const endIso = parsedFrom && parsedTo && parsedFrom.date !== parsedTo.date ? parsedTo.date : undefined;
    if (!startIso) continue;

    // URL-based ID — use the last path segment slug
    const slug = url.replace(/\/$/, "").replace(/\?$/, "").split("/").pop()?.replace(/\.html$/i, "") ?? title;
    const id = `${SLUG}-event-${slug.slice(0, 80)}-${startIso.replace(/-/g, "")}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const teaserMatch = block.match(/<span\s+class="event_teaser">([\s\S]*?)<\/span>/i);
    const description = teaserMatch ? stripTags(teaserMatch[1] ?? "") || undefined : undefined;

    const placeMatch = block.match(/<span\s+class="event_place">([\s\S]*?)<\/span>/i);
    const location = placeMatch ? stripTags(placeMatch[1] ?? "") || undefined : undefined;

    items.push({
      id, title, url,
      startDate: `${startIso}T00:00:00.000Z`,
      ...(endIso ? { endDate: `${endIso}T00:00:00.000Z` } : {}),
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// <a href="/city_info/display/dokument/show.cfm?region_id=342&id=NNN" title="...">
//   Amtsblatt MM/YYYY vom DD. Monatsname YYYY</a>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\s+href="(\/city_info\/display\/dokument\/show\.cfm\?[^"]*?id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1]!).replace(/&amp;/g, "&");
    const docId = m[2]!;
    const linkText = stripTags(m[3] ?? "");
    if (!/Amtsblatt/i.test(linkText)) continue;

    // "Amtsblatt 05/2026 vom 22. Mai 2026"
    const issueMatch = linkText.match(/Amtsblatt\s+(\d+)\/(\d{4})/i);
    const sonderMatch = linkText.match(/Sonderamtsblatt\s+(\d+)\/(\d{4})/i);
    const dateMatch = linkText.match(/vom\s+(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);

    let id: string;
    let title = linkText;
    if (sonderMatch) {
      id = `${SLUG}-amtsblatt-sonder-${sonderMatch[2]}-${sonderMatch[1]!.padStart(2, "0")}`;
    } else if (issueMatch) {
      id = `${SLUG}-amtsblatt-${issueMatch[2]}-${issueMatch[1]!.padStart(2, "0")}`;
    } else {
      id = `${SLUG}-amtsblatt-${docId}`;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string;
    if (dateMatch) {
      const d = parseInt(dateMatch[1]!, 10);
      const mo = MONTHS[dateMatch[2]!];
      const y = dateMatch[3]!;
      if (mo) publishedAt = `${y}-${mo}-${String(d).padStart(2, "0")}T00:00:00.000Z`;
      else publishedAt = `${y}-01-01T00:00:00.000Z`;
    } else if (issueMatch) {
      publishedAt = `${issueMatch[2]}-${issueMatch[1]!.padStart(2, "0")}-01T00:00:00.000Z`;
    } else if (sonderMatch) {
      publishedAt = `${sonderMatch[2]}-01-01T00:00:00.000Z`;
    } else {
      publishedAt = now;
    }

    items.push({
      id, title,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      publishedAt, fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
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
assertAllowed(robots, ["/Aktuelles/", "/Rathaus-und-Service/", "/Seiten/"]);

// Node fetch handles gzip automatically with `Accept-Encoding: gzip`, which is required
// by the active-City installation (sonst Antwort mit 0 Bytes).
const headers = { "User-Agent": AMTSFEED_UA, "Accept-Encoding": "gzip" };
const archiveUrls = amtsblattArchiveUrls();
const [newsHtml, eventsHtml, amtsblattHtml, ...archiveHtmls] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  ...archiveUrls.map((u) => fetch(u, { headers }).then((r) => r.ok ? r.text() : "")),
]);
const allAmtsblattHtml = [amtsblattHtml, ...archiveHtmls].join("\n");

const now = new Date().toISOString();
const today = new Date();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml, today));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(allAmtsblattHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
