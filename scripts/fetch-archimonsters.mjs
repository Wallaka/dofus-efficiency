#!/usr/bin/env node
/**
 * Fetch every archimonster (and its tradeable "Âme de …" soul) from DofusDB and
 * build the bundled snapshot — no copy/paste. Run it LOCALLY (this repo's remote
 * sandbox can't reach api.dofusdb.fr; your machine can):
 *
 *   npm run fetch:ocre
 *
 * What it does, for each monster id in `catalog-src/Ocre/monster-ids.txt`:
 *   1. GET /monsters/:id           → name, level (max grade), picture.
 *   2. GET /items?slug.fr[$search] → the "Âme de <name>" soul item (the price we
 *                                    compare against capturing it ourselves).
 * Then writes `catalog-src/Ocre/archimonsters.raw.json` (the committed snapshot)
 * and regenerates `src/data/archimonsters.generated.ts` via build-ocre.
 *
 * Node 20+ (uses global fetch). Re-runnable; it overwrites the snapshot.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromDisk } from "./build-archimonsters.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const IDS_FILE = join(ROOT, "catalog-src", "Ocre", "monster-ids.txt");
const RAW_FILE = join(ROOT, "catalog-src", "Ocre", "archimonsters.raw.json");
const BASE = "https://api.dofusdb.fr";
const CONCURRENCY = 6;
const PAUSE_MS = 100; // be polite between calls

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      const wait = 500 * 2 ** (attempt - 1);
      console.warn(`  … ${err.message}, retry ${attempt}/${tries - 1} in ${wait}ms`);
      await sleep(wait);
    }
  }
}

/** Prefer the French name, fall back to English, then to a placeholder. */
function pickName(name, fallback) {
  if (name && typeof name === "object") {
    return String(name.fr || name.en || fallback).trim();
  }
  return String(typeof name === "string" && name ? name : fallback).trim();
}

/** Accent/case-insensitive slug, matching how DofusDB's slug.fr search behaves. */
function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A monster's capture level — the highest grade level, else the flat level. */
function monsterLevel(raw) {
  const grades = Array.isArray(raw?.grades) ? raw.grades : [];
  const levels = grades
    .map((g) => Number(g?.level))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (levels.length) return Math.max(...levels);
  return Number(raw?.level) || 0;
}

/** Every integer in the ids file is a monster id; '#' lines are comments. */
function parseIds(text) {
  const ids = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    for (const m of line.matchAll(/\d+/g)) {
      const id = Number(m[0]);
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/** Resolve the "Âme de <monster>" soul item, or null if none is sold. */
async function fetchSoul(monsterName) {
  const slug = slugify(monsterName);
  if (!slug) return null;
  const target = `ame de ${slug}`;
  try {
    const url = `${BASE}/items?slug.fr[$search]=${encodeURIComponent(slug)}&$limit=50&lang=fr`;
    const page = await getJson(url);
    const items = Array.isArray(page?.data) ? page.data : [];
    const named = items.map((it) => ({ it, slug: slugify(pickName(it.name, "")) }));
    // Prefer an exact "Âme de <name>"; else the first soul mentioning the name.
    let hit = named.find((n) => n.slug === target)?.it;
    if (!hit) {
      hit = named.find(
        (n) => n.slug.startsWith("ame de ") && n.slug.includes(slug),
      )?.it;
    }
    if (!hit) return null;
    return {
      soulItemId: String(hit.id),
      soulName: pickName(hit.name, ""),
      soulImg: hit.img,
    };
  } catch {
    return null; // Non-fatal: the archimonster just shows no "acheter" price.
  }
}

/** Run `fn` over `items` with limited concurrency and a polite pause. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      await sleep(PAUSE_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  if (!existsSync(IDS_FILE)) {
    console.error(`[fetch-ocre] missing ${relative(ROOT, IDS_FILE)}`);
    process.exit(1);
  }
  const ids = parseIds(readFileSync(IDS_FILE, "utf8"));
  console.log(`[fetch-ocre] ${ids.length} monster ids`);

  let done = 0;
  let missMonster = 0;
  let missSoul = 0;
  const records = await mapLimit(ids, CONCURRENCY, async (id) => {
    let monster;
    try {
      monster = await getJson(`${BASE}/monsters/${id}?lang=fr`);
    } catch (err) {
      missMonster++;
      console.warn(`  ! monster ${id}: ${err.message}`);
      return { monsterId: id, name: `#${id}`, level: 0 };
    }
    const name = pickName(monster?.name, `#${id}`);
    const level = monsterLevel(monster);
    const soul = await fetchSoul(name);
    if (!soul) {
      missSoul++;
      console.warn(`  ? no soul item for #${id} "${name}"`);
    }
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${ids.length}`);
    return { monsterId: id, name, level, img: monster?.img, ...(soul || {}) };
  });

  mkdirSync(join(ROOT, "catalog-src", "Ocre"), { recursive: true });
  writeFileSync(RAW_FILE, JSON.stringify(records, null, 2) + "\n");
  console.log(
    `[fetch-ocre] wrote ${records.length} → ${relative(ROOT, RAW_FILE)} ` +
      `(${missMonster} monster misses, ${missSoul} without a soul match)`,
  );
  buildFromDisk();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
