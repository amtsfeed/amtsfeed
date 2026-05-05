#!/usr/bin/env tsx
/**
 * Template für einen amtsfeed-Scraper.
 * Kopiere diese Datei nach wiki/<bundesland>/<landkreis>/<gemeinde>/<ort>/index.ts
 * und passe sie an die jeweilige Quelle an.
 *
 * Ausführen: pnpm tsx wiki/.../index.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EventsFile, NewsFile, NewsItem } from "../../scripts/types.ts";

const SOURCE_URL = "https://www.example.de/aktuelles";
const DIR = new URL(".", import.meta.url).pathname;

// Optional: KI-Extraktion via OpenAI-kompatiblem Endpunkt
const OPENAI_BASE_URL = process.env["OPENAI_BASE_URL"] ?? "http://127.0.0.1:1234/v1";
const OPENAI_API_KEY = process.env["OPENAI_API_KEY"] ?? "not-required";
const OPENAI_MODEL_ID = process.env["OPENAI_MODEL_ID"] ?? "local-model";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function extractWithAi(html: string): Promise<NewsItem[]> {
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_ID,
      messages: [
        {
          role: "system",
          content:
            'Extrahiere alle Nachrichten aus dem HTML und gib sie als JSON-Array zurück. Jedes Element hat: id (URL oder eindeutige ID), title, description (optional), url, publishedAt (ISO 8601), updatedAt (ISO 8601). Antworte nur mit dem JSON-Array, kein Markdown.',
        },
        { role: "user", content: html.slice(0, 8000) },
      ],
    }),
  });

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message.content ?? "[]";
  return JSON.parse(content) as NewsItem[];
}

function loadExisting(path: string): NewsFile {
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8")) as NewsFile;
  }
  return { updatedAt: new Date().toISOString(), items: [] };
}

function mergeItems(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

const newsPath = join(DIR, "news.json");
const existing = loadExisting(newsPath);

const html = await fetchHtml(SOURCE_URL);
const incoming = await extractWithAi(html);

const merged = mergeItems(existing.items, incoming);
const result: NewsFile = { updatedAt: new Date().toISOString(), items: merged };

writeFileSync(newsPath, JSON.stringify(result, null, 2), "utf-8");
console.log(`${incoming.length} neue Einträge, ${merged.length} gesamt in ${newsPath}`);

// Wenn diese Gemeinde auch Veranstaltungen hat, kannst du analog eine events.json befüllen.
// Typ dafür: EventsFile (import oben anpassen)
export type { EventsFile };
