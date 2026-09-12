import type { Item, Recipe } from "../types";
import type { AvisReward } from "../lib/avis";
import {
  AVIS_CATEGORY_ID,
  AVITON_ITEM_ID,
  chestCriminalKey,
  monsterCriminalKey,
  questCriminalKey,
  questCriminalName,
} from "../lib/avis";

/**
 * Adapter for the live DofusDB API (https://api.dofusdb.fr) — a Feathers-style
 * JSON API. This runs in the browser (where the API is reachable); the dev
 * sandbox blocks external egress, so it can only be exercised from a real
 * browser, not from CI/tooling.
 *
 * Endpoints used (confirmed shapes):
 *   GET /recipes → { total, limit, skip, data: [{ resultId, ingredientIds[],
 *                    quantities[], jobId, resultLevel }] }
 *   GET /items   → { total, limit, skip, data: [{ id, name: {fr,en,…}, level }] }
 *   GET /jobs    → { ..., data: [{ id, name: {fr,en,…} }] }  (best-effort)
 *
 * Strategy: fetch recipes within a level range (bounds the load), collect every
 * item id they reference, then fetch just those items to resolve names.
 */

export const DOFUSDB_BASE_URL = "https://api.dofusdb.fr";

/** How many recipe pages we'll ever fetch, as a safety valve against runaway loops. */
const MAX_PAGES = 60;
const PAGE_SIZE = 50;
/** DofusDB caps the length of an `$in` array; keep id batches comfortably under it. */
const ID_BATCH_SIZE = 50;

interface FeathersPage<T> {
  total: number;
  limit: number;
  skip: number;
  data: T[];
}

type Translated = { fr?: string; en?: string; [lang: string]: string | undefined };

interface RawItem {
  id: number;
  name?: Translated;
  level?: number;
  img?: string;
}

interface RawRecipe {
  resultId: number;
  ingredientIds?: number[];
  quantities?: number[];
  jobId?: number;
  resultLevel?: number;
}

interface RawJob {
  id: number;
  name?: Translated;
}

export interface LoadOptions {
  minLevel?: number;
  maxLevel?: number;
  signal?: AbortSignal;
}

export interface CraftDataset {
  items: Item[];
  recipes: Recipe[];
}

/** Prefer the French name, fall back to English, then to a stable placeholder. */
function pickName(name: Translated | undefined, fallback: string): string {
  return name?.fr?.trim() || name?.en?.trim() || fallback;
}

/** Normalize a raw DofusDB item into our Item shape. */
function toItem(raw: RawItem): Item {
  return {
    id: String(raw.id),
    name: pickName(raw.name, `#${raw.id}`),
    level: raw.level,
    img: raw.img,
  };
}

/**
 * Search items by (French) name for the autocomplete. DofusDB is Feathers-based
 * and exposes a fuzzy `$search` operator. If the field/operator ever changes,
 * only these two constants need updating.
 */
const SEARCH_FIELD = "name.fr";
const SEARCH_OP = "$search";

export async function searchItems(
  query: string,
  signal?: AbortSignal,
  limit = 15,
): Promise<Item[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `${DOFUSDB_BASE_URL}/items?${SEARCH_FIELD}[${SEARCH_OP}]=` +
    `${encodeURIComponent(q)}&$limit=${limit}&lang=fr`;
  const res = await getJson<FeathersPage<RawItem>>(url, signal);
  return (res.data ?? []).map(toItem);
}

// --- Avis de recherche (legendary-hunt notices) ---------------------------

interface RawQuestRewardItem {
  id: number;
  img?: string;
}
interface RawQuestReward {
  /** Pairs of [itemId, quantity]. */
  itemsReward?: number[][];
  /** Populated reward items (carry img). */
  items?: RawQuestRewardItem[];
}
interface RawQuestStep {
  rewards?: RawQuestReward[];
}
interface RawQuest {
  id: number;
  name?: Translated;
  levelMin?: number;
  steps?: RawQuestStep[];
}

/** Pull the aviton reward (quantity + coin icon) out of a quest's steps. */
function normalizeAvis(quest: RawQuest): AvisReward | null {
  let avitons = 0;
  let img: string | undefined;

  for (const step of quest.steps ?? []) {
    for (const reward of step.rewards ?? []) {
      for (const [itemId, qty] of reward.itemsReward ?? []) {
        if (itemId === AVITON_ITEM_ID) avitons += qty ?? 0;
      }
      if (img == null) {
        img = (reward.items ?? []).find((it) => it.id === AVITON_ITEM_ID)?.img;
      }
    }
  }

  if (avitons <= 0) return null;
  return {
    id: quest.id,
    name: pickName(quest.name, `#${quest.id}`),
    level: quest.levelMin,
    avitons,
    img,
  };
}

interface RawMonster {
  id: number;
  img?: string;
}

interface RawFollower {
  name?: Translated;
  dropMonsterIds?: number[];
}

/** DofusDB type id for "Coffre" (chest) items. */
const CHEST_TYPE_ID = 172;
const CHEST_NAME_PREFIX = "coffre de ";
/** DofusDB type id for "Personnage suiveur" (follower) items — the criminals. */
const FOLLOWER_TYPE_ID = 32;
/** DofusDB super-type id for "Ressource" — used to pick the chest's resource. */
const RESOURCE_SUPER_TYPE_ID = 9;

interface RawItemTyped extends RawItem {
  type?: { superTypeId?: number };
}

/** Run `fn` over `items` with limited concurrency (avoids a request burst). */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * The resource inside an avis's chest, e.g. "Fleur de <criminal>". It shares no
 * id with the avis/chest — only the criminal name — and each criminal's resource
 * is a different item type, so we search by the criminal name and keep the
 * result that is a Ressource whose name contains the criminal.
 */
async function fetchAvisResource(
  criminalDisplay: string,
  criminalKey: string,
  signal?: AbortSignal,
): Promise<Item | null> {
  if (!criminalDisplay) return null;
  try {
    const url =
      `${DOFUSDB_BASE_URL}/items?name.fr[$search]=` +
      `${encodeURIComponent(criminalDisplay)}&$limit=15&lang=fr`;
    const res = await getJson<FeathersPage<RawItemTyped>>(url, signal);
    const resources = (res.data ?? []).filter(
      (it) => it.type?.superTypeId === RESOURCE_SUPER_TYPE_ID,
    );
    const match =
      resources.find((it) =>
        monsterCriminalKey(pickName(it.name, "")).includes(criminalKey),
      ) ?? resources[0];
    return match ? toItem(match) : null;
  } catch {
    return null;
  }
}

/**
 * Criminal name key → monster image, for the avis picture.
 *
 * The `isBounty` filter on /monsters doesn't work, so we go via the follower
 * items (type 32): each names the criminal and points to its monster through
 * `dropMonsterIds`. We then fetch just those monsters' images by id.
 */
async function fetchAvisMonsterImages(
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  try {
    const followers = await fetchAllPages<RawFollower>(
      "/items",
      `typeId=${FOLLOWER_TYPE_ID}&lang=fr`,
      signal,
      20,
    );

    const keyToMonster = new Map<string, number>();
    const monsterIds = new Set<number>();
    for (const f of followers) {
      const name = pickName(f.name, "");
      const monsterId = f.dropMonsterIds?.[0];
      if (!name || monsterId == null) continue;
      const key = monsterCriminalKey(name);
      if (key && !keyToMonster.has(key)) {
        keyToMonster.set(key, monsterId);
        monsterIds.add(monsterId);
      }
    }

    const imgByMonster = new Map<number, string>();
    const ids = [...monsterIds];
    for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
      const batch = ids.slice(i, i + ID_BATCH_SIZE);
      const query = batch.map((id) => `id[$in][]=${id}`).join("&");
      const monsters = await fetchAllPages<RawMonster>(
        "/monsters",
        query,
        signal,
        3,
      );
      for (const m of monsters) if (m.img) imgByMonster.set(m.id, m.img);
    }

    for (const [key, monsterId] of keyToMonster) {
      const img = imgByMonster.get(monsterId);
      if (img) byKey.set(key, img);
    }
  } catch {
    // Non-fatal: avis just fall back to the aviton icon.
  }
  return byKey;
}

/** Criminal name key → "Coffre de …" chest item, the tradeable resource. */
async function fetchAvisChests(
  signal?: AbortSignal,
): Promise<Map<string, Item>> {
  const byKey = new Map<string, Item>();
  try {
    const raw = await fetchAllPages<RawItem>(
      "/items",
      `typeId=${CHEST_TYPE_ID}&lang=fr`,
      signal,
      20,
    );
    for (const it of raw) {
      const name = pickName(it.name, "");
      if (!name.toLowerCase().startsWith(CHEST_NAME_PREFIX)) continue;
      const key = chestCriminalKey(name);
      if (key && !byKey.has(key)) byKey.set(key, toItem(it));
    }
  } catch {
    // Non-fatal: avis just show no resource.
  }
  return byKey;
}

/** Fetch all aviton-rewarding avis de recherche, enriched and most avitons first. */
export async function fetchAvisDeRecherche(
  signal?: AbortSignal,
): Promise<AvisReward[]> {
  const [raw, monsterImgs, chests] = await Promise.all([
    fetchAllPages<RawQuest>(
      "/quests",
      `categoryId=${AVIS_CATEGORY_ID}&lang=fr`,
      signal,
    ),
    fetchAvisMonsterImages(signal),
    fetchAvisChests(signal),
  ]);

  const list = raw
    .map(normalizeAvis)
    .filter((a): a is AvisReward => a != null)
    .map((avis) => {
      const key = questCriminalKey(avis.name);
      const monsterImg = monsterImgs.get(key);
      const chest = chests.get(key);
      return {
        ...avis,
        img: monsterImg ?? avis.img, // prefer the criminal's picture
        chestItemId: chest?.id,
        chestName: chest?.name,
        chestImg: chest?.img,
      };
    });

  // Resolve each chest's resource by searching the criminal name (bounded
  // concurrency to avoid an 80+ request burst).
  const resources = await mapLimit(list, 6, (avis) =>
    fetchAvisResource(
      questCriminalName(avis.name),
      questCriminalKey(avis.name),
      signal,
    ),
  );
  list.forEach((avis, i) => {
    const resource = resources[i];
    if (resource) {
      avis.resourceItemId = resource.id;
      avis.resourceName = resource.name;
      avis.resourceImg = resource.img;
    }
  });

  list.sort((a, b) => b.avitons - a.avitons);
  return list;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`DofusDB a répondu ${res.status} (${res.statusText})`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch every page of a Feathers collection matching `query` (a pre-built query
 * string without pagination params). Stops at MAX_PAGES as a safety valve.
 */
async function fetchAllPages<T>(
  path: string,
  query: string,
  signal?: AbortSignal,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = [];
  let skip = 0;

  for (let page = 0; page < maxPages; page++) {
    const sep = query ? "&" : "";
    const url = `${DOFUSDB_BASE_URL}${path}?${query}${sep}$limit=${PAGE_SIZE}&$skip=${skip}`;
    const res = await getJson<FeathersPage<T>>(url, signal);
    const batch = res.data ?? [];
    out.push(...batch);

    skip += res.limit || PAGE_SIZE;
    const total = res.total ?? out.length;
    if (batch.length === 0 || skip >= total) break;
  }

  return out;
}

/** Resolve item ids to normalized Items, fetching only the ids we actually need. */
async function fetchItemsByIds(
  ids: number[],
  signal?: AbortSignal,
): Promise<Map<number, Item>> {
  const byId = new Map<number, Item>();
  const unique = [...new Set(ids)];

  for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) {
    const batch = unique.slice(i, i + ID_BATCH_SIZE);
    const query = batch.map((id) => `id[$in][]=${id}`).join("&");
    const raw = await fetchAllPages<RawItem>("/items", query, signal, 3);
    for (const it of raw) {
      byId.set(it.id, toItem(it));
    }
  }

  return byId;
}

/** Best-effort jobId → job name map. Returns an empty map if /jobs is unavailable. */
async function fetchJobNames(signal?: AbortSignal): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const raw = await fetchAllPages<RawJob>("/jobs", "", signal, 5);
    for (const job of raw) {
      map.set(job.id, pickName(job.name, `Métier ${job.id}`));
    }
  } catch {
    // Non-fatal: recipes just won't show a profession name.
  }
  return map;
}

/**
 * Load a real craft dataset from DofusDB for the given result-item level range.
 * The level range keeps the number of recipes (and therefore requests) bounded.
 */
export async function loadCraftData(
  opts: LoadOptions = {},
): Promise<CraftDataset> {
  const minLevel = opts.minLevel ?? 1;
  const maxLevel = opts.maxLevel ?? 20;
  const { signal } = opts;

  const recipeQuery =
    `resultLevel[$gte]=${minLevel}&resultLevel[$lte]=${maxLevel}` +
    `&$sort[resultLevel]=1`;
  const rawRecipes = await fetchAllPages<RawRecipe>(
    "/recipes",
    recipeQuery,
    signal,
  );

  // Every item id we need a name for: results + all ingredients.
  const idSet = new Set<number>();
  for (const r of rawRecipes) {
    if (r.resultId != null) idSet.add(r.resultId);
    for (const ing of r.ingredientIds ?? []) idSet.add(ing);
  }

  const [itemsById, jobNames] = await Promise.all([
    fetchItemsByIds([...idSet], signal),
    fetchJobNames(signal),
  ]);

  // Normalize recipes, keeping ids unique even if an item has several recipes.
  const recipes: Recipe[] = [];
  const recipeCountByResult = new Map<number, number>();
  for (const r of rawRecipes) {
    if (r.resultId == null || !Array.isArray(r.ingredientIds)) continue;

    const ingredients = r.ingredientIds.map((itemId, idx) => ({
      itemId: String(itemId),
      quantity: r.quantities?.[idx] ?? 1,
    }));

    const seen = recipeCountByResult.get(r.resultId) ?? 0;
    recipeCountByResult.set(r.resultId, seen + 1);
    const id = seen === 0 ? `r-${r.resultId}` : `r-${r.resultId}-${seen}`;

    recipes.push({
      id,
      resultItemId: String(r.resultId),
      job: r.jobId != null ? jobNames.get(r.jobId) : undefined,
      ingredients,
    });
  }

  // Make sure every referenced item exists in the items list, even if the
  // /items fetch didn't return it (so the UI never shows a bare numeric id).
  const items = new Map<string, Item>();
  for (const it of itemsById.values()) items.set(it.id, it);
  for (const id of idSet) {
    const key = String(id);
    if (!items.has(key)) items.set(key, { id: key, name: `#${key}` });
  }

  return { items: [...items.values()], recipes };
}
