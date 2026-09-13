import type { CraftDataset } from "../data/dofusApi";
import type { RaisingInput } from "./eleveur";
import type { AvisCatalog, AvisReward } from "./avis";
import type { Item, PriceMap } from "../types";

/**
 * Tiny persistence layer.
 *
 * Uses localStorage for now: prices are a small string-keyed map, and cached
 * datasets are modest JSON. When we add screenshots/images and larger data
 * (Phase 1+), this is the single place to swap in IndexedDB — the rest of the
 * app only sees these load/save helpers.
 */
const PRICES_KEY = "dofus-efficiency:prices:v1";
const DATASET_PREFIX = "dofus-efficiency:dataset:v1:";
const LAST_SOURCE_KEY = "dofus-efficiency:lastSource:v1";
const FAVOURITES_KEY = "dofus-efficiency:favourites:v1";
const ELEVEUR_KEY = "dofus-efficiency:eleveur:v1";
// v2: catalog now carries the chest resource — invalidate v1 caches so the
// page refetches automatically instead of showing resource-less cards.
const AVIS_KEY = "dofus-efficiency:avisCatalog:v2";

export function loadPrices(): PriceMap | null {
  try {
    const raw = localStorage.getItem(PRICES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PriceMap;
    return null;
  } catch {
    return null;
  }
}

export function savePrices(prices: PriceMap): void {
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  } catch {
    // Storage full or unavailable (private mode) — non-fatal.
  }
}

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

/** Éleveur (raising-profitability) inputs, persisted between sessions. */
export function loadEleveur(): RaisingInput | null {
  try {
    const raw = localStorage.getItem(ELEVEUR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.costs)) return parsed as RaisingInput;
    return null;
  } catch {
    return null;
  }
}

export function saveEleveur(input: RaisingInput): void {
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
