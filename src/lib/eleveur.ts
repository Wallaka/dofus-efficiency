/**
 * Éleveur (breeder) profitability model — the "brisage" loop.
 *
 * The money-making method this models, step by step:
 *  1. Capture wild dragodindes — each capture spends some "Filtre à frousse".
 *  2. Raise them in your enclos for a number of days (food / upkeep costs).
 *  3. "Briser" (break) each raised mount → it yields runes.
 *  4. Sell the runes at the HDV.
 *
 * How many mounts you can run at once is capped by your enclos: your éleveur
 * level unlocks a number of enclos, each holding a number of mounts. That
 * level → (enclos, capacity) mapping isn't a public constant and changes with
 * the game, so instead of hard-coding it we keep an editable breakpoint table
 * (the user types the thresholds they know) and resolve the current slots from
 * it. Everything else — filtre count, food, rune yield — is priced from the
 * shared price store, so the numbers stay honest and update themselves.
 *
 * The compute function is pure (input + prices + tax rate → result) so it's
 * trivially testable and mirrors how the craft/métier pages fold in HDV tax.
 */

import type { Item, PriceMap } from "../types";

/** The capture filter used on wild dragodindes (from the built-in catalog). */
export const FILTRE_ITEM: Item = {
  id: "17869",
  name: "Filtre à frousse",
  img: "https://api.dofusdb.fr/img/items/164099.png",
  level: 200,
};

/**
 * One row of the éleveur level → slots table: from `level` onward you have
 * `enclos` enclos of `capacity` mounts each. The resolver walks the rows in
 * ascending order and keeps the last one whose `level` you've reached.
 */
export interface LevelBreakpoint {
  id: string;
  /** Éleveur level at which this row takes effect. */
  level: number;
  /** Number of enclos unlocked at/after this level. */
  enclos: number;
  /** Mounts each enclos can hold. */
  capacity: number;
}

/**
 * A raising cost incurred per mount. Two flavours, like the craft/métier pages:
 *  - manual: a `label` + fixed `amount` in kamas.
 *  - item-linked: references a tracked item (`itemId`), priced × `quantity`
 *    from the shared price map (e.g. a food item).
 */
export interface CostLine {
  id: string;
  label: string;
  /** Manual kamas amount. Used only when `itemId` is not set. */
  amount?: number;
  /** When set, this line is item-linked and priced × quantity. */
  itemId?: string;
  /** Quantity for an item-linked line. */
  quantity?: number;
}

/**
 * One rune yielded by brisage, valued from the shared price store. `quantity`
 * is the *average* number obtained per broken mount, so fractional values are
 * allowed (e.g. 0.4 of a rune per mount on average).
 */
export interface OutputLine {
  id: string;
  itemId: string;
  label: string;
  img?: string;
  /** Average quantity obtained per mount (fractional allowed). */
  quantity?: number;
}

export interface EleveurInput {
  /** Current éleveur profession level, used to resolve the slots table. */
  level?: number;
  /** Editable level → (enclos, capacity) table. */
  breakpoints: LevelBreakpoint[];
  /**
   * Manual overrides for enclos / capacity. When set, they win over the value
   * derived from the table — handy while the table is still being filled in.
   */
  enclosOverride?: number;
  capacityOverride?: number;

  /** Filets spent to capture one dragodinde. */
  captureFiltres?: number;
  /**
   * The capture item ("filet"), priced from the store. Chosen by search since
   * filets have job-level requirements (a different one per level bracket).
   * Undefined means no filet picked → no capture cost.
   */
  filtreItemId?: string;
  filtreLabel?: string;
  filtreImg?: string;

  /** Days a mount is raised before it can be broken (for profit-per-day). */
  raiseDays?: number;
  /** Food / upkeep costs charged per mount. */
  raiseCosts: CostLine[];

  /** Runes obtained per mount when broken. */
  outputs: OutputLine[];
}

export interface EleveurResult {
  /** Enclos actually used (override if set, else derived from the table). */
  enclos: number;
  /** Mounts per enclos actually used. */
  capacity: number;
  /** What the table alone gives for the current level (before overrides). */
  derivedEnclos: number;
  derivedCapacity: number;
  /** enclos × capacity — mounts processed in one full rotation. */
  totalSlots: number;

  /** Filtre spend to capture one mount, in kamas. */
  captureCostPerMount: number;
  /** Food / upkeep per mount, in kamas. */
  raiseCostPerMount: number;
  /** captureCost + raiseCost per mount. */
  costPerMount: number;

  /** Rune sale value per mount, before HDV tax. */
  grossRevenuePerMount: number;
  /** HDV tax on one mount's runes. */
  taxPerMount: number;
  /** Rune value per mount after tax. */
  netRevenuePerMount: number;
  /** netRevenue − cost, per mount. */
  profitPerMount: number;
  /** profitPerMount / costPerMount, as a ratio. undefined if cost is 0. */
  marginRatio?: number;

  /** Filtres needed to fill every slot once. */
  filtresPerCycle: number;
  /** Kamas cost of those filtres. */
  filtresCostPerCycle: number;
  /** profitPerMount × totalSlots — one full rotation. */
  profitPerCycle: number;
  /** profitPerCycle / raiseDays. undefined without a usable duration. */
  profitPerDay?: number;

  /** Item ids referenced (filtre, food, runes) that have no known price. */
  missingPriceItemIds: string[];
}

/**
 * Resolve enclos + capacity for a level from the breakpoint table: the last
 * row (by level) whose threshold is ≤ the level wins. Below every threshold,
 * or with an empty table, you have no slots.
 */
export function slotsForLevel(
  level: number | undefined,
  breakpoints: LevelBreakpoint[],
): { enclos: number; capacity: number } {
  const lvl = level ?? 0;
  const sorted = [...breakpoints]
    .filter((b) => Number.isFinite(b.level))
    .sort((a, b) => a.level - b.level);
  let cur = { enclos: 0, capacity: 0 };
  for (const bp of sorted) {
    if (bp.level <= lvl) {
      cur = {
        enclos: Math.max(0, bp.enclos || 0),
        capacity: Math.max(0, bp.capacity || 0),
      };
    }
  }
  return cur;
}

/** The kamas cost of a single raising-cost line (item-linked priced × qty). */
export function lineCost(line: CostLine, prices: PriceMap): number {
  if (line.itemId != null) {
    const unit = prices[line.itemId];
    return unit == null ? 0 : unit * (line.quantity ?? 0);
  }
  return line.amount ?? 0;
}

/** True when a line is item-linked but that item has no known price. */
export function isMissingPrice(line: CostLine, prices: PriceMap): boolean {
  return line.itemId != null && prices[line.itemId] == null;
}

/** The kamas value of one output (rune) line: unit price × average quantity. */
export function outputValue(line: OutputLine, prices: PriceMap): number {
  const unit = prices[line.itemId];
  return unit == null ? 0 : unit * (line.quantity ?? 0);
}

/** True when an output line's rune has no known price yet. */
export function isMissingOutputPrice(
  line: OutputLine,
  prices: PriceMap,
): boolean {
  return prices[line.itemId] == null;
}

/**
 * The whole model. `taxRate` is the HDV sell tax as a fraction (e.g. 0.02),
 * charged on rune revenue only — filtres and food are bought, not sold.
 */
export function computeEleveur(
  input: EleveurInput,
  prices: PriceMap,
  taxRate = 0,
): EleveurResult {
  const derived = slotsForLevel(input.level, input.breakpoints);
  const enclos =
    input.enclosOverride != null && input.enclosOverride >= 0
      ? input.enclosOverride
      : derived.enclos;
  const capacity =
    input.capacityOverride != null && input.capacityOverride >= 0
      ? input.capacityOverride
      : derived.capacity;
  const totalSlots = enclos * capacity;

  const filtreId = input.filtreItemId;
  const filtrePrice = filtreId != null ? prices[filtreId] : undefined;
  const filtresPerMount = Math.max(0, input.captureFiltres ?? 0);
  const captureCostPerMount =
    filtreId != null ? (filtrePrice ?? 0) * filtresPerMount : 0;

  const raiseCostPerMount = input.raiseCosts.reduce(
    (sum, c) => sum + lineCost(c, prices),
    0,
  );
  const costPerMount = captureCostPerMount + raiseCostPerMount;

  const grossRevenuePerMount = input.outputs.reduce(
    (sum, o) => sum + outputValue(o, prices),
    0,
  );
  const taxPerMount = grossRevenuePerMount * taxRate;
  const netRevenuePerMount = grossRevenuePerMount - taxPerMount;
  const profitPerMount = netRevenuePerMount - costPerMount;
  const marginRatio =
    costPerMount > 0 ? profitPerMount / costPerMount : undefined;

  const filtresPerCycle = filtresPerMount * totalSlots;
  const filtresCostPerCycle = captureCostPerMount * totalSlots;
  const profitPerCycle = profitPerMount * totalSlots;
  const profitPerDay =
    input.raiseDays != null && input.raiseDays > 0
      ? profitPerCycle / input.raiseDays
      : undefined;

  // Missing-price bookkeeping, so the UI can flag what to price.
  const missing = new Set<string>();
  if (filtreId != null && filtresPerMount > 0 && filtrePrice == null) {
    missing.add(filtreId);
  }
  for (const c of input.raiseCosts) {
    if (isMissingPrice(c, prices)) missing.add(c.itemId as string);
  }
  for (const o of input.outputs) {
    if (isMissingOutputPrice(o, prices)) missing.add(o.itemId);
  }

  return {
    enclos,
    capacity,
    derivedEnclos: derived.enclos,
    derivedCapacity: derived.capacity,
    totalSlots,
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
    missingPriceItemIds: [...missing],
  };
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh manual raising-cost line. */
export function newCostLine(label = ""): CostLine {
  return { id: makeId(), label };
}

/** A raising-cost line linked to a tracked item (e.g. a food), priced × qty. */
export function newItemCostLine(item: Item, quantity = 1): CostLine {
  return { id: makeId(), label: item.name, itemId: item.id, quantity };
}

/** A fresh rune output line linked to an item. */
export function newOutputLine(item: Item, quantity = 1): OutputLine {
  return {
    id: makeId(),
    itemId: item.id,
    label: item.name,
    img: item.img,
    quantity,
  };
}

/** A fresh, editable level-breakpoint row. */
export function newBreakpoint(
  level = 1,
  enclos = 1,
  capacity = 1,
): LevelBreakpoint {
  return { id: makeId(), level, enclos, capacity };
}

/**
 * A first-run input the user then edits. The breakpoint table is seeded with
 * the known éleveur enclos progression: 1 enclos of 10 places at level 1, then
 * one more enclos every 40 levels (40/80/120/160/200). All rows stay editable.
 * The filet is a searchable pick (defaults to Filtre à frousse) since filets
 * have job-level requirements.
 */
export function defaultEleveurInput(): EleveurInput {
  return {
    level: 1,
    breakpoints: [
      newBreakpoint(1, 1, 10),
      newBreakpoint(40, 2, 10),
      newBreakpoint(80, 3, 10),
      newBreakpoint(120, 4, 10),
      newBreakpoint(160, 5, 10),
      newBreakpoint(200, 6, 10),
    ],
    captureFiltres: 1,
    filtreItemId: FILTRE_ITEM.id,
    filtreLabel: FILTRE_ITEM.name,
    filtreImg: FILTRE_ITEM.img,
    raiseDays: undefined,
    raiseCosts: [newCostLine("Nourriture")],
    outputs: [],
  };
}
