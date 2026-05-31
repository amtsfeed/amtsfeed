#!/usr/bin/env tsx
/**
 * Post-processing: vergleicht jede modifizierte JSON-Datei (news/events/amtsblatt/notices/robots)
 * gegen git HEAD und stellt updatedAt-Felder wieder her, wenn sich am Item-Inhalt nichts geändert hat.
 * Top-level updatedAt wird nur dann modern gehalten, wenn mindestens ein Item-Inhalt sich ändert.
 *
 * Item-Vergleich: alle Keys außer "fetchedAt" und "updatedAt" müssen exakt gleich sein.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();

function gitHead(path: string): string | null {
  try {
    return execSync(`git show HEAD:"${path}"`, { encoding: "utf-8", cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function modifiedJsonFiles(): string[] {
  // -uall: untracked Dateien einzeln auflisten (sonst nur Ordner ohne JSON-Pfade)
  const out = execSync("git status --porcelain -uall -z", { encoding: "utf-8", cwd: ROOT });
  const entries = out.split("\0").filter(Boolean);
  const files: string[] = [];
  for (const e of entries) {
    const status = e.slice(0, 2);
    const path = e.slice(3);
    if (!/^(.M| M|MM|A |AM)$/.test(status)) continue;
    if (!path.endsWith(".json")) continue;
    if (!/\/(news|events|amtsblatt|notices|robots)\.json$/.test(path)) continue;
    files.push(path);
  }
  return files;
}

function contentKey(item: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  const keys = Object.keys(item).filter((k) => k !== "fetchedAt" && k !== "updatedAt").sort();
  for (const k of keys) filtered[k] = item[k];
  return JSON.stringify(filtered);
}

function normalizeItems(oldItems: any[], newItems: any[]): { items: any[]; anyChanged: boolean } {
  const oldById = new Map(oldItems.map((it) => [it.id, it]));
  let anyChanged = false;
  const result: any[] = [];
  for (const item of newItems) {
    const oldItem = oldById.get(item.id);
    if (!oldItem) {
      anyChanged = true;
      result.push(item);
      continue;
    }
    if (contentKey(item) === contentKey(oldItem)) {
      // Inhalt unverändert → updatedAt und fetchedAt aus alter Version übernehmen
      const merged = { ...item };
      if ("updatedAt" in oldItem) merged.updatedAt = oldItem.updatedAt;
      else delete merged.updatedAt;
      if ("fetchedAt" in oldItem) merged.fetchedAt = oldItem.fetchedAt;
      else delete merged.fetchedAt;
      result.push(merged);
    } else {
      anyChanged = true;
      result.push(item);
    }
  }
  // Wenn Items im alten Stand existieren, die im neuen fehlen → das ist auch eine Änderung
  if (oldItems.length !== newItems.length) {
    const newIds = new Set(newItems.map((it) => it.id));
    for (const o of oldItems) if (!newIds.has(o.id)) { anyChanged = true; break; }
  }
  return { items: result, anyChanged };
}

function normalizeRobots(oldDoc: any, newDoc: any): { doc: any; changed: boolean } {
  // robots.json: compare full content except updatedAt/fetchedAt
  const oldNoTs = { ...oldDoc }; delete oldNoTs.updatedAt; delete oldNoTs.fetchedAt;
  const newNoTs = { ...newDoc }; delete newNoTs.updatedAt; delete newNoTs.fetchedAt;
  const changed = JSON.stringify(oldNoTs) !== JSON.stringify(newNoTs);
  if (!changed) {
    const merged = { ...newDoc };
    if ("updatedAt" in oldDoc) merged.updatedAt = oldDoc.updatedAt;
    if ("fetchedAt" in oldDoc) merged.fetchedAt = oldDoc.fetchedAt;
    return { doc: merged, changed: false };
  }
  return { doc: newDoc, changed: true };
}

let restored = 0;
let touched = 0;
for (const file of modifiedJsonFiles()) {
  const headStr = gitHead(file);
  if (!headStr) continue;
  const current = JSON.parse(readFileSync(file, "utf-8"));
  const old = JSON.parse(headStr);

  if (file.endsWith("robots.json")) {
    const { doc, changed } = normalizeRobots(old, current);
    if (!changed) {
      writeFileSync(file, JSON.stringify(doc, null, 2) + (current ? "" : ""));
      restored++;
    } else {
      touched++;
    }
    continue;
  }

  // news/events/amtsblatt/notices: items[] + updatedAt
  const { items, anyChanged } = normalizeItems(old.items ?? [], current.items ?? []);
  let updatedAt: string = current.updatedAt;
  if (!anyChanged && old.updatedAt) updatedAt = old.updatedAt;

  const newDoc = { updatedAt, items };
  const oldFull = JSON.stringify(current);
  const newFull = JSON.stringify(newDoc);
  if (oldFull !== newFull) {
    writeFileSync(file, JSON.stringify(newDoc, null, 2));
  }
  if (anyChanged) touched++;
  else restored++;
}

console.log(`Files restored (no content change, updatedAt reverted): ${restored}`);
console.log(`Files with actual changes: ${touched}`);
