#!/usr/bin/env node
/**
 * Build the bundled archimonster list from the fetched snapshot.
 *
 * Reads `catalog-src/Ocre/archimonsters.raw.json` (written by
 * `scripts/fetch-archimonsters.mjs`) and writes
 * `src/data/archimonsters.generated.ts`. Pure and re-runnable — no network — so
 * it can be tested and re-run without hitting DofusDB.
 *
 * Usage: node scripts/build-archimonsters.mjs   (or: npm run build:ocre)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const RAW_FILE = join(ROOT, "catalog-src", "Ocre", "archimonsters.raw.json");
const OUT_FILE = join(ROOT, "src", "data", "archimonsters.generated.ts");

/** Reduce a raw snapshot record to the bundled archimonster shape. */
export function normalizeArchimonster(raw) {
  if (raw == null || raw.monsterId == null) return null;
  const rec = {
    monsterId: Number(raw.monsterId),
    name: String(raw.name ?? `#${raw.monsterId}`).trim(),
    level: Number(raw.level) || 0,
  };
  if (raw.img) rec.img = String(raw.img);
  if (raw.soulItemId != null && raw.soulItemId !== "") {
    rec.soulItemId = String(raw.soulItemId);
    if (raw.soulName) rec.soulName = String(raw.soulName).trim();
    if (raw.soulImg) rec.soulImg = String(raw.soulImg);
  }
  return rec;
}

/** Dedupe by monster id and sort by level, then name. */
export function buildArchimonsters(rawList) {
  const byId = new Map();
  for (const raw of rawList) {
    const rec = normalizeArchimonster(raw);
    if (rec && !byId.has(rec.monsterId)) byId.set(rec.monsterId, rec);
  }
  return [...byId.values()].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name, "fr"),
  );
}

/** Serialize the list to `src/data/archimonsters.generated.ts`. */
export function writeArchimonsters(list, generatedAt = new Date().toISOString()) {
  const banner =
    'import type { Archimonster } from "./ocre";\n\n' +
    "/**\n * AUTO-GENERATED — do not edit by hand.\n" +
    " * Run `npm run fetch:ocre` (network, local) to refresh from DofusDB.\n */\n\n";
  const body =
    `export const ARCHIMONSTERS_GENERATED_AT = ${JSON.stringify(generatedAt)};\n\n` +
    `export const ARCHIMONSTERS: Archimonster[] = ${JSON.stringify(list, null, 2)};\n`;
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, banner + body);
  return list.length;
}

/** Read the raw snapshot (if any) and (re)write the generated list. */
export function buildFromDisk() {
  let raw = [];
  if (existsSync(RAW_FILE)) {
    const parsed = JSON.parse(readFileSync(RAW_FILE, "utf8"));
    raw = Array.isArray(parsed) ? parsed : parsed?.data ?? [];
  }
  const list = buildArchimonsters(raw);
  const n = writeArchimonsters(list);
  const withSoul = list.filter((a) => a.soulItemId).length;
  console.log(
    `[build-ocre] wrote ${n} archimonsters (${withSoul} with a purchasable soul) → ${relative(ROOT, OUT_FILE)}`,
  );
  return list;
}

// Only run when invoked directly (so tests can import the pure functions).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildFromDisk();
}
