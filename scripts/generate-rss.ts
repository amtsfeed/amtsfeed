#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { NewsFile, AmtsblattFile, NoticesFile, NewsItem, AmtsblattItem, NoticeItem } from "./types.ts";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function newsToItem(news: NewsItem): string {
  return `    <item>
      <title>${escapeXml(news.title)}</title>
      <link>${escapeXml(news.url)}</link>
      <guid isPermaLink="false">${escapeXml(news.id)}</guid>
      <pubDate>${new Date(news.publishedAt ?? news.fetchedAt).toUTCString()}</pubDate>
      ${news.description ? `<description>${escapeXml(news.description)}</description>` : ""}
    </item>`;
}

function amtsblattToItem(a: AmtsblattItem): string {
  return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(a.url)}</link>
      <guid isPermaLink="false">${escapeXml(a.id)}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <category>Amtsblatt</category>
    </item>`;
}

function noticeToItem(n: NoticeItem): string {
  return `    <item>
      <title>${escapeXml(n.title)}</title>
      <link>${escapeXml(n.url)}</link>
      <guid isPermaLink="false">${escapeXml(n.id)}</guid>
      <pubDate>${new Date(n.publishedAt).toUTCString()}</pubDate>
      <category>Bekanntmachung</category>
    </item>`;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function generateRss(dir: string): void {
  const newsFile = readJson<NewsFile>(join(dir, "news.json"));
  const amtsblattFile = readJson<AmtsblattFile>(join(dir, "amtsblatt.json"));
  const noticesFile = readJson<NoticesFile>(join(dir, "notices.json"));

  const allItems: string[] = [];

  if (newsFile) {
    const sorted = [...newsFile.items].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    allItems.push(...sorted.map(newsToItem));
  }

  if (amtsblattFile) {
    const sorted = [...amtsblattFile.items].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    allItems.push(...sorted.map(amtsblattToItem));
  }

  if (noticesFile) {
    const sorted = [...noticesFile.items].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    allItems.push(...sorted.map(noticeToItem));
  }

  const channelTitle = escapeXml(dir.split("/").at(-1) ?? "amtsfeed");
  const buildDate = new Date().toUTCString();

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${channelTitle}</title>
    <link>https://amtsfeed.de</link>
    <description>Amtliche Informationen für ${channelTitle}</description>
    <language>de</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
${allItems.join("\n")}
  </channel>
</rss>
`;

  const outPath = join(dir, "rss.xml");
  writeFileSync(outPath, rss, "utf-8");
  console.log(`Wrote ${allItems.length} items to ${outPath}`);
}

function findDirsWithData(root: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      const hasData = ["events.json", "news.json", "amtsblatt.json", "notices.json"].some(
        (f) => existsSync(join(full, f))
      );
      if (hasData) results.push(full);
      results.push(...findDirsWithData(full));
    }
  }
  return results;
}

if (process.argv[2]) {
  generateRss(resolve(process.argv[2]));
} else {
  const wikiRoot = resolve("wiki");
  const dirs = findDirsWithData(wikiRoot);
  for (const dir of dirs) {
    generateRss(dir);
  }
}
