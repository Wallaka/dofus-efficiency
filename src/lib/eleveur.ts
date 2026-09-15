/**
 * Éleveur (breeder) profitability model — the "brisage" loop, simplified.
 *
 * The user provides only two things: their éleveur **level** and the **mount**
 * they capture. Everything else is automatic:
 *  - Enclos: 1 enclos of 10 places at level 1, then +1 enclos every 40 levels
 *    (40/80/120/160/200). Derived from the level, not configurable.
 *  - Filet: the best capture net usable at that level for that creature.
 *  - Runes: the hardcoded brisage yield of the mount (probabilistic).
 *  - Food: driven by the chosen mangeoire over the raising time (TODO — pending
 *    the mangeoire data; contributes 0 for now).
 *
 * Only market prices (filet, runes, food) are entered, and those come from the
 * shared price store. The compute function is pure and evaluated for one
 * mounts-per-capture value (the page calls it with the filet's min and max
 * bounds to show a worst/best-case spread).
 */

import type { PriceMap } from "../types";
import { bestFiletFor, type FiletCreature, type FiletDef } from "./filets";
import { brisageFor, type RuneYield } from "./mounts";

export const ENCLOS_CAPACITY = 10;
const ENCLOS_THRESHOLDS = [40, 80, 120, 160, 200];

/** Enclos unlocked at a level: 1 at level 1, then +1 per threshold reached. */
export function enclosForLevel(level: number | undefined): number {
  const lvl = level ?? 0;
  if (lvl < 1) return 0;
  return 1 + ENCLOS_THRESHOLDS.filter((t) => lvl >= t).length;
}

export interface EleveurInput {
  /** Éleveur profession level — drives the enclos count and the filet. */
  level?: number;
  /** The wild mount captured / raised / broken. */
  mountId?: string;
  mountLabel?: string;
  mountImg?: string;
  mountCreature?: FiletCreature;
  /** Hours to raise a mount to a brisage-ready state (≈ 10). */
  raiseHours?: number;
}

export interface EleveurResult {
  enclos: number;
  capacity: number;
  totalSlots: number;

  /** The auto-picked capture net (undefined below level 1). */
  filet?: FiletDef;
  /** Filet spend to capture one mount, in kamas. */
  captureCostPerMount: number;
  /** Food / upkeep per mount (mangeoire) — 0 until the mangeoire is wired. */
  raiseCostPerMount: number;
  /** captureCost + raiseCost per mount. */
  costPerMount: number;

  /** Rune sale value per mount, before HDV tax (expected value). */
  grossRevenuePerMount: number;
  taxPerMount: number;
  netRevenuePerMount: number;
  profitPerMount: number;
  marginRatio?: number;

  /** Filets needed to fill every slot once, and their cost. */
  filtresPerCycle: number;
  filtresCostPerCycle: number;
  /** One full rotation (all slots). */
  profitPerCycle: number;
  /** profitPerCycle × (24 / raiseHours) — profit per day, rotations back-to-back. */
  profitPerDay?: number;

  /** The runes this mount yields (for display), and their expected qty helper. */
  runes: RuneYield[];
  /** Item ids (filet, runes) with no known price. */
  missingPriceItemIds: string[];
}

/** Expected count from a probabilistic yield: chance × mid-range quantity. */
export function expectedQuantity(
  chance: number | undefined,
  min: number | undefined,
  max: number | undefined,
): number {
  const c = Math.min(1, Math.max(0, chance ?? 1));
  const lo = min ?? 0;
  const hi = max ?? lo;
  return c * ((lo + hi) / 2);
}

/** Expected number of a rune per broken mount. */
export function runeExpectedQty(r: RuneYield): number {
  return expectedQuantity(r.chance, r.quantityMin, r.quantityMax);
}

/**
 * The whole model, evaluated for one `mountsPerCapture` value (the page calls it
 * with the filet's min and max bounds). `taxRate` is the HDV sell tax as a
 * fraction (e.g. 0.02), charged on rune revenue only. `mountsPerCapture`
 * defaults to the filet's max bound.
 */
export function computeEleveur(
  input: EleveurInput,
  prices: PriceMap,
  taxRate = 0,
  mountsPerCapture?: number,
): EleveurResult {
  const enclos = enclosForLevel(input.level);
  const capacity = ENCLOS_CAPACITY;
  const totalSlots = enclos * capacity;

  // Only pick a filet once a mount (creature) is chosen — capture is
  // creature-specific, so without a mount there's nothing to capture.
  const filet = input.mountCreature
    ? bestFiletFor(input.level, input.mountCreature)
    : undefined;
  const mpc = Math.max(1, mountsPerCapture ?? filet?.mountsMax ?? 1);
  const filetPrice = filet ? prices[filet.id] : undefined;
  // One filet per capture; a filet that catches several mounts splits its cost.
  const filtresPerMount = filet ? 1 / mpc : 0;
  const captureCostPerMount = filet ? (filetPrice ?? 0) * filtresPerMount : 0;

  const runes = brisageFor(input.mountId);
  const grossRevenuePerMount = runes.reduce((sum, r) => {
    const unit = prices[r.itemId];
    return sum + (unit == null ? 0 : unit * runeExpectedQty(r));
  }, 0);
  const taxPerMount = grossRevenuePerMount * taxRate;
  const netRevenuePerMount = grossRevenuePerMount - taxPerMount;

  // TODO: food cost from the chosen mangeoire over raiseHours. 0 for now.
  const raiseCostPerMount = 0;

  const costPerMount = captureCostPerMount + raiseCostPerMount;
  const profitPerMount = netRevenuePerMount - costPerMount;
  const marginRatio =
    costPerMount > 0 ? profitPerMount / costPerMount : undefined;

  const filtresPerCycle = filtresPerMount * totalSlots;
  const filtresCostPerCycle = captureCostPerMount * totalSlots;
  const profitPerCycle = profitPerMount * totalSlots;
  const hours = input.raiseHours;
  const profitPerDay =
    hours != null && hours > 0 ? profitPerCycle * (24 / hours) : undefined;

  const missing = new Set<string>();
  if (filet != null && filtresPerMount > 0 && filetPrice == null) {
    missing.add(filet.id);
  }
  for (const r of runes) {
    if (prices[r.itemId] == null) missing.add(r.itemId);
  }

  return {
    enclos,
    capacity,
    totalSlots,
    filet,
    captureCostPerMount,
    raiseCostPerMount,
    costPerMount,
    grossRevenuePerMount,
    taxPerMount,
    netRevenuePerMount,
    profitPerMount,
    marginRatio,
    filtresPerCycle,
    filtresCostPerCycle,
    profitPerCycle,
    profitPerDay,
    runes,
    missingPriceItemIds: [...missing],
  };
}

/** A first-run input: max level, no mount picked yet, ~10 h raising. */
export function defaultEleveurInput(): EleveurInput {
  return {
    level: 200,
    mountId: undefined,
    raiseHours: 10,
  };
}
