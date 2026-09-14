import type { Item, PriceMap } from "../types";
import type { Lot, ScreenshotAnalysis } from "./screenshotAnalysis";

/**
 * Persist an OCR'd price for a chosen item (the feedback loop). `extra` carries
 * richer readings kept for reference (e.g. a resource's per-quantity lot prices).
 */
export type ApplyPrice = (
  item: Item,
  price: number,
  detail: string,
  extra?: { lots?: Lot[] },
) => void;

/**
 * The stored price "database": for each item we keep not just the price (which
 * the craft/éleveur maths read) but *metadata* — when it was recorded and how
 * (OCR from a screenshot, or typed by hand). That lets the Prix page show each
 * price's age and whether it's fresh or needs re-scanning.
 *
 * This is the single source of truth for prices: the plain number map the calc
 * reads (PriceMap) is *derived* from these entries via `pricesFromEntries`, so
 * the two can never drift.
 */

const ENTRIES_KEY = "dofus-efficiency:priceEntries:v1";
/** Legacy standalone price map (pre-single-store); folded into entries once. */
const LEGACY_PRICES_KEY = "dofus-efficiency:prices:v1";

/** Prices older than this are flagged "à mettre à jour" (the HDV moves fast). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type PriceSource = "ocr" | "manual";

export interface PriceEntry {
  itemId: string;
  /** Item name captured at record time, so the Prix page needs no dataset. */
  name: string;
  level?: number;
  img?: string;
  /** Unit price in kamas. */
  price: number;
  /** When this price was recorded (ms since epoch). */
  updatedAt: number;
  source: PriceSource;
  /** Short human note on where the price came from (e.g. "Cours du marché"). */
  detail?: string;
  /** Per-quantity lot prices (x1/x10/x100/x1000), kept for resources. */
  lots?: Lot[];
}

export type PriceEntryMap = Record<string, PriceEntry>;

export function loadPriceEntries(): PriceEntryMap {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PriceEntryMap;
    return {};
  } catch {
    return {};
  }
}

export function savePriceEntries(map: PriceEntryMap): void {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(map));
  } catch {
    // non-fatal (quota / private mode)
  }
}

/** Insert or replace one item's price entry. */
export function recordPriceEntry(entry: PriceEntry): void {
  const map = loadPriceEntries();
  map[entry.itemId] = entry;
  savePriceEntries(map);
}

/** Forget one item's stored price entry. */
export function deletePriceEntry(itemId: string): void {
  const map = loadPriceEntries();
  if (itemId in map) {
    delete map[itemId];
    savePriceEntries(map);
  }
}

/** Derive the plain price map the maths read from the entries. */
export function pricesFromEntries(entries: PriceEntryMap): PriceMap {
  const map: PriceMap = {};
  for (const id of Object.keys(entries)) map[id] = entries[id].price;
  return map;
}

/** The current price map, derived from the stored entries. */
export function loadPricesView(): PriceMap {
  return pricesFromEntries(loadPriceEntries());
}

/**
 * One-time migration from the old standalone price map to entries. Any price
 * that has no entry yet (e.g. typed on the Éleveur page in an older version) is
 * folded in as a stale "manual" entry so it survives and stays shareable, then
 * the legacy key is dropped.
 */
export function migrateLegacyPriceMap(): void {
  try {
    const raw = localStorage.getItem(LEGACY_PRICES_KEY);
    if (raw == null) return;
    const map = JSON.parse(raw);
    if (map && typeof map === "object" && !Array.isArray(map)) {
      const entries = loadPriceEntries();
      let changed = false;
      for (const [id, price] of Object.entries(map)) {
        if (typeof price === "number" && !entries[id]) {
          entries[id] = {
            itemId: id,
            name: id,
            price,
            updatedAt: 0, // unknown age → flagged "à mettre à jour"
            source: "manual",
            detail: "Repris d'une version précédente",
          };
          changed = true;
        }
      }
      if (changed) savePriceEntries(entries);
    }
    localStorage.removeItem(LEGACY_PRICES_KEY);
  } catch {
    // Migration is best-effort; a bad legacy blob shouldn't break startup.
  }
}

/** Is this entry past the freshness window? */
export function isStale(updatedAt: number, now = Date.now()): boolean {
  return now - updatedAt > STALE_AFTER_MS;
}

/** Coarse relative age in French, e.g. "aujourd'hui", "il y a 3 j". */
export function relativeAge(updatedAt: number, now = Date.now()): string {
  const days = Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

/**
 * Which single unit price to store for an analysed screenshot, and a short label
 * for where it came from. "Prix moyen" is already a unit price for resources and
 * the item price for equipment/weapons, so it's the primary choice; the market
 * graph's median and a resource's x1 lot are fallbacks.
 */
export function priceToRecord(
  a: ScreenshotAnalysis,
): { price: number; detail: string } | null {
  if (a.kind === "market-trend") {
    const price = a.averagePrice ?? a.medianPrice;
    if (price != null) return { price, detail: "Cours du marché" };
  }
  if (a.averagePrice != null) {
    return { price: a.averagePrice, detail: "Prix moyen" };
  }
  const unit = a.lots.find((l) => l.quantity === 1)?.unitPrice;
  if (unit != null) return { price: Math.round(unit), detail: "Lot x1" };
  return null;
}
