import type { PriceMap } from "../types";

/**
 * Tiny persistence layer for the price map.
 *
 * Phase 0 uses localStorage: prices are a small string-keyed map, so this is
 * plenty. When we add screenshots/images and larger datasets (Phase 1+), this
 * is the single place to swap in IndexedDB — the rest of the app only sees
 * loadPrices/savePrices.
 */
const PRICES_KEY = "dofus-efficiency:prices:v1";

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
    // Storage full or unavailable (private mode) — non-fatal for Phase 0.
  }
}
