/**
 * User overrides for the brisage rune yield of each muldo. The hardcoded values
 * in mounts.ts are estimates; this lets the user tune proba + quantity per rune,
 * persisted in localStorage. Keyed by mount id → the full rune list for that
 * mount (an override replaces the default list entirely).
 */

import { brisageFor, type RuneYield } from "./mounts";

export type BrisageOverrides = Record<string, RuneYield[]>;

const KEY = "dofus-efficiency:brisageOverrides:v1";

function isRuneYield(x: unknown): x is RuneYield {
  if (!x || typeof x !== "object") return false;
  const r = x as RuneYield;
  return (
    typeof r.itemId === "string" &&
    typeof r.label === "string" &&
    typeof r.chance === "number" &&
    typeof r.quantityMin === "number" &&
    typeof r.quantityMax === "number"
  );
}

export function loadBrisageOverrides(): BrisageOverrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: BrisageOverrides = {};
    for (const [id, runes] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(runes) && runes.every(isRuneYield)) out[id] = runes as RuneYield[];
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBrisageOverrides(overrides: BrisageOverrides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    // non-fatal
  }
}

/** The runes a mount yields: the user's override if any, else the default. */
export function resolveBrisage(
  mountId: string | undefined,
  overrides: BrisageOverrides,
): RuneYield[] {
  if (mountId != null && overrides[mountId]) return overrides[mountId];
  return brisageFor(mountId);
}
