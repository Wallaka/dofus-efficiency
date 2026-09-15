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
import { bestFiletFor, filetById, type FiletCreature, type FiletDef } from "./filets";
import { brisageFor, mountById, type RuneYield } from "./mounts";
import { mangeoireById, type MangeoireDef } from "./mangeoires";

/** A rune line for display: aggregated expected quantity per mount. */
export interface RuneLine {
  itemId: string;
  label: string;
  img: string;
  /** Expected quantity per mount (blended across the selected mounts). */
  perMount: number;
}

export const ENCLOS_CAPACITY = 10;
const ENCLOS_THRESHOLDS = [40, 80, 120, 160, 200];

/** A mount must reach level 53 to be brisage-ready. */
export const BRISAGE_LEVEL = 53;
/** Total xp (= energy, 1:1) to reach it, per enclos — shared, mount-count independent. */
export const ENERGY_PER_ENCLOS = 39360;
/** Leveling rate: 10 xp every 10 s = 1 xp/s. */
export const XP_PER_SECOND = 1;
/** Raising time is fixed by the xp: 39 360 xp / 1 xp/s. */
export const RAISE_SECONDS = ENERGY_PER_ENCLOS / XP_PER_SECOND;
export const RAISE_HOURS = RAISE_SECONDS / 3600;

/** Enclos unlocked at a level: 1 at level 1, then +1 per threshold reached. */
export function enclosForLevel(level: number | undefined): number {
  const lvl = level ?? 0;
  if (lvl < 1) return 0;
  return 1 + ENCLOS_THRESHOLDS.filter((t) => lvl >= t).length;
}

export interface EleveurInput {
  /** Éleveur profession level — drives the enclos count and the filet. */
  level?: number;
  /**
   * The wild mounts captured / raised / broken. Several = diversify: capacity is
   * split equally between them, so revenue and runes are the average across them.
   */
  mountIds?: string[];
  /**
   * Chosen capture net. Undefined = auto (the best usable filet); set it to
   * compare a specific filet's profitability. Must be usable for the creature.
   */
  filetId?: string;
  /** The mangeoire fuel used to raise the mounts (its energy drives food cost). */
  mangeoireId?: string;
  /**
   * How many full rotations you realistically complete per day. A rotation
   * takes ~11 h of raising plus your own idle time, so this is rarely 24/11 —
   * default 1. Drives the profit-per-day figure (the planner can fill it in).
   */
  rotationsPerDay?: number;
  /** Connection window (clock hours) used by the rotation planner. */
  availFrom?: number;
  availTo?: number;
  /** Forecast horizon in days (default 7). */
  forecastDays?: number;
}

/** The creature of the selected mounts (all muldos share one), or undefined. */
export function mountCreatureOf(input: EleveurInput): FiletCreature | undefined {
  const first = input.mountIds?.[0];
  return mountById(first)?.creature;
}

/**
 * The filet in effect: the explicit choice if set, otherwise the best usable
 * one. Undefined until a mount (creature) is chosen.
 */
export function resolveFilet(input: EleveurInput): FiletDef | undefined {
  const creature = mountCreatureOf(input);
  if (creature == null) return undefined;
  if (input.filetId != null) return filetById(input.filetId);
  return bestFiletFor(input.level, creature);
}

export interface EleveurResult {
  enclos: number;
  capacity: number;
  totalSlots: number;

  /** The auto-picked capture net (undefined below level 1). */
  filet?: FiletDef;
  /** Filet spend to capture one mount, in kamas. */
  captureCostPerMount: number;
  /** The chosen mangeoire (undefined if none picked). */
  mangeoire?: MangeoireDef;
  /** Mangeoires needed per enclos, and across all enclos (a full rotation). */
  mangeoiresPerEnclos: number;
  mangeoiresPerCycle: number;
  /** Total food cost for one rotation, in kamas. */
  foodCostPerCycle: number;
  /** Food / upkeep per mount (mangeoire fuel amortized over the slots). */
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

  /** The runes yielded (aggregated across the selected mounts), for display. */
  runes: RuneLine[];
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
  brisageOverrides: Record<string, RuneYield[]> = {},
): EleveurResult {
  const enclos = enclosForLevel(input.level);
  const capacity = ENCLOS_CAPACITY;
  const totalSlots = enclos * capacity;

  // The filet in effect (explicit choice, else best) — only once a mount is
  // chosen, since capture is creature-specific.
  const filet = resolveFilet(input);
  const mpc = Math.max(1, mountsPerCapture ?? filet?.mountsMax ?? 1);
  const filetPrice = filet ? prices[filet.id] : undefined;
  // One filet per capture; a filet that catches several mounts splits its cost.
  const filtresPerMount = filet ? 1 / mpc : 0;
  const captureCostPerMount = filet ? (filetPrice ?? 0) * filtresPerMount : 0;

  // Runes: capacity is split equally between the selected mounts, so each mount
  // contributes 1/N of its yield to the per-mount average. Same rune from
  // several mounts is merged.
  const mountIds = input.mountIds ?? [];
  const n = mountIds.length;
  const acc = new Map<string, RuneLine>();
  if (n > 0) {
    for (const mid of mountIds) {
      const yields = brisageOverrides[mid] ?? brisageFor(mid);
      for (const r of yields) {
        const perMount = runeExpectedQty(r) / n;
        const ex = acc.get(r.itemId);
        if (ex) ex.perMount += perMount;
        else acc.set(r.itemId, { itemId: r.itemId, label: r.label, img: r.img, perMount });
      }
    }
  }
  const runes = [...acc.values()];
  const grossRevenuePerMount = runes.reduce((sum, r) => {
    const unit = prices[r.itemId];
    return sum + (unit == null ? 0 : unit * r.perMount);
  }, 0);
  const taxPerMount = grossRevenuePerMount * taxRate;
  const netRevenuePerMount = grossRevenuePerMount - taxPerMount;

  // Food: each enclos needs ENERGY_PER_ENCLOS energy (shared, mount-count
  // independent). A mangeoire is a battery of `energy`; you buy whole ones, the
  // last one overfills → ceil. Cost is spread across the enclos's slots.
  const mangeoire = mangeoireById(input.mangeoireId);
  const mangeoirePrice = mangeoire ? prices[mangeoire.id] : undefined;
  const mangeoiresPerEnclos =
    mangeoire && mangeoire.energy > 0
      ? Math.ceil(ENERGY_PER_ENCLOS / mangeoire.energy)
      : 0;
  const mangeoiresPerCycle = mangeoiresPerEnclos * enclos;
  const foodCostPerCycle = mangeoiresPerCycle * (mangeoirePrice ?? 0);
  const raiseCostPerMount = totalSlots > 0 ? foodCostPerCycle / totalSlots : 0;

  const costPerMount = captureCostPerMount + raiseCostPerMount;
  const profitPerMount = netRevenuePerMount - costPerMount;
  const marginRatio =
    costPerMount > 0 ? profitPerMount / costPerMount : undefined;

  const filtresPerCycle = filtresPerMount * totalSlots;
  const filtresCostPerCycle = captureCostPerMount * totalSlots;
  const profitPerCycle = profitPerMount * totalSlots;
  // A rotation takes ~11 h of raising plus idle time, so profit-per-day follows
  // how many rotations you actually complete (default 1), not a 24 h theoretical.
  const rotationsPerDay = Math.max(0, input.rotationsPerDay ?? 1);
  const profitPerDay = profitPerCycle * rotationsPerDay;

  const missing = new Set<string>();
  if (filet != null && filtresPerMount > 0 && filetPrice == null) {
    missing.add(filet.id);
  }
  for (const r of runes) {
    if (prices[r.itemId] == null) missing.add(r.itemId);
  }
  if (mangeoire != null && mangeoirePrice == null) missing.add(mangeoire.id);

  return {
    enclos,
    capacity,
    totalSlots,
    filet,
    captureCostPerMount,
    mangeoire,
    mangeoiresPerEnclos,
    mangeoiresPerCycle,
    foodCostPerCycle,
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

/** A first-run input: max level, no mount picked, a common mid-tier mangeoire. */
export function defaultEleveurInput(): EleveurInput {
  return {
    level: 200,
    mountIds: [],
    mangeoireId: "33341", // Grand Extrait de Mangeoire (4000 énergie)
    rotationsPerDay: 1,
    availFrom: 8,
    availTo: 24,
  };
}
