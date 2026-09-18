import type { CraftDataset } from "../data/dofusApi";
import type { EleveurInput } from "./eleveur";
import type { AvisCatalog, AvisReward } from "./avis";
import type { Item } from "../types";

/**
 * Tiny persistence layer.
 *
 * Uses localStorage for now: prices are a small string-keyed map, and cached
 * datasets are modest JSON. When we add screenshots/images and larger data
 * (Phase 1+), this is the single place to swap in IndexedDB — the rest of the
 * app only sees these load/save helpers.
 */
const DATASET_PREFIX = "dofus-efficiency:dataset:v1:";
const LAST_SOURCE_KEY = "dofus-efficiency:lastSource:v1";
const FAVOURITES_KEY = "dofus-efficiency:favourites:v1";
// v3: the éleveur page was simplified to just a level + mount (enclos, filet,
// runes are all derived now), so the stored shape changed again. A new key
// drops stale v1/v2 data instead of mis-reading it.
const ELEVEUR_KEY = "dofus-efficiency:eleveur:v3";
// v3: catalog now carries the "Carte de …" hunt map too — invalidate older
// caches so the page refetches automatically instead of showing carte-less cards.
const AVIS_KEY = "dofus-efficiency:avisCatalog:v3";
// v2: participation is now per-avis (a map keyed by avis id), not a single fee.
const AVIS_PARTICIPATION_KEY = "dofus-efficiency:avisParticipation:v2";
const AVIS_AVITON_KEY = "dofus-efficiency:avisAviton:v1";
const AVIS_CHASSE_ONLY_KEY = "dofus-efficiency:avisChasseOnly:v1";
const AVIS_LEVEL_RANGE_KEY = "dofus-efficiency:avisLevelRange:v1";
const AVIS_OVERRIDES_KEY = "dofus-efficiency:avisOverrides:v1";
const AVIS_FAVOURITES_KEY = "dofus-efficiency:avisFavourites:v1";

/** A DofusDB dataset cached under a key (e.g. a level range), with a timestamp. */
export interface CachedDataset extends CraftDataset {
  fetchedAt: number;
}

export function loadDataset(key: string): CachedDataset | null {
  try {
    const raw = localStorage.getItem(DATASET_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.recipes)) {
      return parsed as CachedDataset;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDataset(key: string, dataset: CraftDataset): void {
  try {
    const payload: CachedDataset = { ...dataset, fetchedAt: Date.now() };
    localStorage.setItem(DATASET_PREFIX + key, JSON.stringify(payload));
  } catch {
    // Cache is a nice-to-have; ignore quota/availability failures.
  }
}

/** Remember which data source (and dataset key) was last active, to restore it. */
export function loadLastSource(): string | null {
  try {
    return localStorage.getItem(LAST_SOURCE_KEY);
  } catch {
    return null;
  }
}

export function saveLastSource(value: string): void {
  try {
    localStorage.setItem(LAST_SOURCE_KEY, value);
  } catch {
    // non-fatal
  }
}

/**
 * Favourites — the "lite DB": items the user chose to keep an eye on. We store
 * the full Item (a small cached catalog) so they render without a dataset load.
 */
export function loadFavourites(): Item[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is Item =>
          x && typeof x.id === "string" && typeof x.name === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}

export function saveFavourites(items: Item[]): void {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(items));
  } catch {
    // non-fatal
  }
}

/**
 * Dofus Ocre progress: which archimonsters have been captured. Keyed by DofusDB
 * monster id (string) → capture timestamp (ms). The archimonster catalog itself
 * is bundled (generated), so we only persist the ids the user has ticked off.
 */
const OCRE_CAPTURED_KEY = "dofus-efficiency:ocreCaptured:v1";

export function loadOcreCaptured(): Record<string, number> {
  try {
    const raw = localStorage.getItem(OCRE_CAPTURED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [id, at] of Object.entries(parsed)) {
        const n = Number(at);
        out[id] = Number.isFinite(n) ? n : Date.now();
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveOcreCaptured(map: Record<string, number>): void {
  try {
    localStorage.setItem(OCRE_CAPTURED_KEY, JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

/** Éleveur (brisage-profitability) inputs, persisted between sessions. */
export function loadEleveur(): EleveurInput | null {
  try {
    const raw = localStorage.getItem(ELEVEUR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as EleveurInput;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveEleveur(input: EleveurInput): void {
  try {
    localStorage.setItem(ELEVEUR_KEY, JSON.stringify(input));
  } catch {
    // non-fatal
  }
}

/** Cached DofusDB avis-de-recherche catalog, so the page loads instantly. */
export function loadAvisCatalog(): AvisCatalog | null {
  try {
    const raw = localStorage.getItem(AVIS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.list)) return parsed as AvisCatalog;
    return null;
  } catch {
    return null;
  }
}

export function saveAvisCatalog(list: AvisReward[]): void {
  try {
    const payload: AvisCatalog = { list, fetchedAt: Date.now() };
    localStorage.setItem(AVIS_KEY, JSON.stringify(payload));
  } catch {
    // non-fatal
  }
}

/**
 * Optional "spot" fee paid to participate in each hunt — a per-avis cost map
 * (avis id → kamas) folded into that avis's benefit. Missing means no fee.
 */
export function loadAvisParticipation(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AVIS_PARTICIPATION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) out[k] = n;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveAvisParticipation(map: Record<string, number>): void {
  try {
    localStorage.setItem(AVIS_PARTICIPATION_KEY, JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

/**
 * How much a batch of avitons sells for: `qty` avitons for `price` kamas. The
 * per-aviton value derives from these; 0/0 means avitons aren't valued yet.
 */
export interface AvisAvitonRate {
  qty: number;
  price: number;
}

export function loadAvisAviton(): AvisAvitonRate {
  const empty: AvisAvitonRate = { qty: 0, price: 0 };
  try {
    const raw = localStorage.getItem(AVIS_AVITON_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const qty = Number(parsed.qty);
      const price = Number(parsed.price);
      return {
        qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
        price: Number.isFinite(price) && price > 0 ? price : 0,
      };
    }
    return empty;
  } catch {
    return empty;
  }
}

export function saveAvisAviton(rate: AvisAvitonRate): void {
  try {
    localStorage.setItem(AVIS_AVITON_KEY, JSON.stringify(rate));
  } catch {
    // non-fatal
  }
}

/**
 * Whether avis are done through the legendary hunt alone (no quest), which halves
 * the aviton reward. Defaults to false (quest active → full avitons).
 */
export function loadAvisChasseOnly(): boolean {
  try {
    return localStorage.getItem(AVIS_CHASSE_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAvisChasseOnly(on: boolean): void {
  try {
    localStorage.setItem(AVIS_CHASSE_ONLY_KEY, on ? "1" : "0");
  } catch {
    // non-fatal
  }
}

/**
 * The level-range filter for the avis list. A null bound means "no limit" on that
 * side. Persisted so the chosen range sticks between visits.
 */
export interface AvisLevelRange {
  min: number | null;
  max: number | null;
}

export function loadAvisLevelRange(): AvisLevelRange {
  const empty: AvisLevelRange = { min: null, max: null };
  try {
    const raw = localStorage.getItem(AVIS_LEVEL_RANGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const toBound = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      };
      return { min: toBound(parsed.min), max: toBound(parsed.max) };
    }
    return empty;
  } catch {
    return empty;
  }
}

export function saveAvisLevelRange(range: AvisLevelRange): void {
  try {
    localStorage.setItem(AVIS_LEVEL_RANGE_KEY, JSON.stringify(range));
  } catch {
    // non-fatal
  }
}

/**
 * Manual corrections when the auto-fetch mismatches an avis: per avis, the user
 * can pin the right "Carte de …" and/or resource item. Keyed by avis id; each
 * slot is the chosen Item. Survives a catalog refresh.
 */
export interface AvisSlotOverride {
  carte?: Item;
  resource?: Item;
}
export type AvisOverrides = Record<string, AvisSlotOverride>;

function isItem(x: unknown): x is Item {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as Item).id === "string" &&
    typeof (x as Item).name === "string"
  );
}

export function loadAvisOverrides(): AvisOverrides {
  try {
    const raw = localStorage.getItem(AVIS_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: AvisOverrides = {};
    for (const [id, slot] of Object.entries(parsed as Record<string, unknown>)) {
      if (!slot || typeof slot !== "object") continue;
      const s = slot as AvisSlotOverride;
      const clean: AvisSlotOverride = {};
      if (isItem(s.carte)) clean.carte = s.carte;
      if (isItem(s.resource)) clean.resource = s.resource;
      if (clean.carte || clean.resource) out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveAvisOverrides(map: AvisOverrides): void {
  try {
    localStorage.setItem(AVIS_OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

/**
 * Avis the user marked as favourites — the ones they run often. Stored as a set
 * of avis ids (strings), so a "Favoris" toggle can isolate them. Persisted so the
 * starred set sticks between visits and survives a catalog refresh.
 */
export function loadAvisFavourites(): string[] {
  try {
    const raw = localStorage.getItem(AVIS_FAVOURITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export function saveAvisFavourites(ids: string[]): void {
  try {
    localStorage.setItem(AVIS_FAVOURITES_KEY, JSON.stringify(ids));
  } catch {
    // non-fatal
  }
}

/**
 * Cached carte-de-recherche craft recipes (carte item id → ingredients), so the
 * avis page doesn't refetch a recipe every time a craft breakdown is opened. An
 * empty ingredient list means the carte is known to be non-craftable.
 */
export interface CarteIngredient {
  item: Item;
  quantity: number;
}
export type CarteRecipeCache = Record<string, CarteIngredient[]>;

const CARTE_RECIPES_KEY = "dofus-efficiency:carteRecipes:v1";

export function loadCarteRecipes(): CarteRecipeCache {
  try {
    const raw = localStorage.getItem(CARTE_RECIPES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CarteRecipeCache;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveCarteRecipes(map: CarteRecipeCache): void {
  try {
    localStorage.setItem(CARTE_RECIPES_KEY, JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

/**
 * HDV resources the user chose to hide: item ids the price-punching flow skips
 * (and the progress count ignores) until they're shown again. Persisted so the
 * hidden set sticks between visits.
 */
const HDV_HIDDEN_KEY = "dofus-efficiency:hdvHidden:v1";

export function loadHdvHidden(): string[] {
  try {
    const raw = localStorage.getItem(HDV_HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export function saveHdvHidden(ids: string[]): void {
  try {
    localStorage.setItem(HDV_HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    // non-fatal
  }
}
