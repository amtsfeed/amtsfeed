#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EventsFile, NewsFile, Event, NewsItem,
  AmtsblattFile, AmtsblattItem,
  NoticesFile, NoticeItem,
} from "../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../scripts/robots.ts";

// ── Quelle: PortUNA-CMS (verwaltungsportal.de)
//   News:           /news/index.php?archiv=1&rubrik=1   (vollständiges Archiv)
//   Events:         /veranstaltungen/index.php          (event-box-Liste, alle Termine)
//   Amtsblatt:      /amtsblatt/index.php?ebene=496      (gazette_-Tabelle, Jahresgruppen)
//   Bekanntmachung: /bekanntmachungen/index.php?ebene=496 (PortUNA-Tabellenvariante)

const BASE_URL = "https://www.osl-online.de";
const NEWS_ARCHIVE_URL = `${BASE_URL}/news/index.php?archiv=1&rubrik=1`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php?ebene=496`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php?ebene=496`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Archivseite: Date-Header `<h3 class="title_archive_NN ...">DD.MM.YYYY</h3>`
// gefolgt von einer `<ul>` mit `<li><a href="/news/1/{ID}/nachrichten/{slug}.html">Titel</a></li>`.
// Mehrere Items pro Datum möglich; Datum gilt bis zum nächsten Date-Header.

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Token-Stream: abwechselnd Datum-Header und Item-Anker, in Reihenfolge.
  const rx = /<h3 class="title_archive_[^"]*"[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/h3>|<a href="(\/news\/\d+\/(\d+)\/nachrichten\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let publishedAt: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    if (m[1] && m[2] && m[3]) {
      publishedAt = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
      continue;
    }
    if (!m[4] || !m[5]) continue;
    const href = m[4];
    const newsId = m[5];
    const title = decodeHtmlEntities((m[6] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title || title === "mehr") continue;
    const id = `lk-osl-news-${newsId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title,
      url: `${BASE_URL}${decodeHtmlEntities(href)}`,
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA event-box: <div class="event-box"> mit
//   <a href="/veranstaltungen/{eventId}/YYYY/MM/DD/{slug}.html">…</a>
//   <span class="event-time"><time>HH:MM</time> Uhr bis <time>HH:MM</time></span>
//   <span class="event-ort">…</span>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split('<div class="event-box">').slice(1);
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"/);
    if (!hrefMatch) continue;
    const [, href, eventId, yyyy, mm, dd] = hrefMatch;

    const id = `lk-osl-event-${eventId}-${yyyy}${mm}${dd}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Titel: <span class="event-title"><a …>TITEL</a></span>
    const titleMatch = block.match(/<span class="event-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const timeMatch = block.match(/<span class="event-time">[\s\S]*?<time>([\d:]+)<\/time>(?:[\s\S]*?<time>([\d:]+)<\/time>)?/);
    let startDate = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    let endDate: string | undefined;
    if (timeMatch?.[1]) startDate = `${yyyy}-${mm}-${dd}T${timeMatch[1]}:00.000Z`;
    if (timeMatch?.[2]) endDate = `${yyyy}-${mm}-${dd}T${timeMatch[2]}:00.000Z`;

    const ortMatch = block.match(/<span class="event-ort">([\s\S]*?)<\/span>/);
    const location = ortMatch
      ? decodeHtmlEntities((ortMatch[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : undefined;

    events.push({
      id,
      title,
      url: `${BASE_URL}${decodeHtmlEntities(href!)}`,
      startDate,
      ...(endDate && endDate !== startDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Jahresweise Akkordeons mit Tabellenzeilen:
//   <tr><td>Nr. N/YYYY</td><td>DD.MM.YYYY</td><td>…form action="…#gazette_{ID}"…</td></tr>
// PDFs werden via POST-Formular zugestellt; URL = Listenseite mit Anker.

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<tr>\s*<td>\s*Nr\.\s*([\d/]+)\s*<\/td>\s*<td>\s*([\d.&#;\s]+?)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const ausgabe = m[1]!.trim(); // z.B. "15/2026"
    const dateStr = (m[2] ?? "").replace(/&#8203;/g, "").trim();
    const dateMatch = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const downloadCell = m[3]!;
    const gazetteIdMatch = downloadCell.match(/gazette_(\d+)/);
    const gazetteId = gazetteIdMatch ? gazetteIdMatch[1]! : ausgabe.replace(/[^\d]/g, "");

    // Direkten Datei-Link versuchen; PortUNA gazette-PDFs werden meist per POST geliefert,
    // daher Fallback auf Listenseite + Anker.
    const directHref = downloadCell.match(/href="(https?:\/\/[^"]+\.pdf[^"]*)"/i);
    const url = directHref ? directHref[1]! : `${AMTSBLATT_URL}#gazette_${gazetteId}`;

    const ausgabeParts = ausgabe.match(/^(\d+)\/(\d{4})$/);
    const id = ausgabeParts
      ? `lk-osl-amtsblatt-${ausgabeParts[2]}-${ausgabeParts[1]!.padStart(2, "0")}`
      : `lk-osl-amtsblatt-${gazetteId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt Nr. ${ausgabe}`,
      url,
      publishedAt,
      fetchedAt: now,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Bekanntmachungen ──────────────────────────────────────────────────────────
// PortUNA-Tabellenvariante:
//   <tr valign="top">
//     <td class="table-title">DD.MM.YYYY</td>
//     <td>
//       <a title="Download: TITEL" href="https://daten.verwaltungsportal.de/.../FILE.pdf">…</a>
//       <span class="provision-info">(bereitgestellt am: DD.MM.YYYY)</span>
//       <a href="/bekanntmachung/{ID}/{slug}.html">Weitere Downloads/Links</a>?
//     </td>
//   </tr>

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRx = /<tr[^>]*>\s*<td class="table-title">\s*([\d.&#;\s]+?)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html)) !== null) {
    const dateStr = (m[1] ?? "").replace(/&#8203;/g, "").trim();
    const dateMatch = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const cell = m[2]!;
    // Titel aus title="Download: …"
    const titleMatch = cell.match(/title="Download:\s*([\s\S]*?)"/);
    let title = titleMatch
      ? decodeHtmlEntities(titleMatch[1]!.trim())
      : "";
    if (!title) {
      const anchor = cell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      title = anchor ? decodeHtmlEntities(anchor[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()) : "";
    }
    if (!title) continue;

    // Bekanntmachungs-ID aus internem Link (falls vorhanden), sonst PDF-Pfad
    const internalMatch = cell.match(/href="\/bekanntmachung\/(\d+)\//);
    const pdfMatch = cell.match(/href="(https?:\/\/[^"]+\.pdf[^"]*)"/i);
    const noticeId = internalMatch ? internalMatch[1]! : null;
    const pdfUrl = pdfMatch ? pdfMatch[1]! : null;
    const url = pdfUrl ?? (noticeId ? `${BASE_URL}/bekanntmachung/${noticeId}/` : NOTICES_URL);

    const id = noticeId
      ? `lk-osl-notice-${noticeId}`
      : `lk-osl-notice-${publishedAt.slice(0, 10)}-${encodeURIComponent(title).slice(0, 40)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

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
function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/amtsblatt/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };

const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_ARCHIVE_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_ARCHIVE_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NOTICES_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
