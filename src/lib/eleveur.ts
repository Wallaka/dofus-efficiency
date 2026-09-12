/**
 * Raising-profitability model for the éleveur (breeder) page.
 *
 * Deliberately generic: rather than hard-code Dofus breeding mechanics (food
 * types, serenity, maturity curves — which vary and change), the user lists the
 * costs of raising a mount and its expected sale price. We turn that into the
 * numbers that matter for a money-making decision: net profit, margin, and
 * profit per day (so it's comparable to crafting/farming).
 */

import type { Item, PriceMap } from "../types";

/**
 * One cost line in the raising budget.
 *
 * Two flavours:
 *  - manual: just a `label` + `amount` in kamas.
 *  - item-linked: references a tracked item (`itemId`); its cost is the item's
 *    unit price (from the shared price map) × `quantity`, so it stays in sync
 *    with the prices tracked on the craft page.
 */
export interface CostLine {
  id: string;
  label: string;
  /** Manual kamas amount. Used only when `itemId` is not set. */
  amount?: number;
  /** When set, this line is item-linked and its cost is priced × quantity. */
  itemId?: string;
  /** Quantity for an item-linked line. */
  quantity?: number;
}

export interface RaisingInput {
  /** Expected HDV sale price of the raised mount, in kamas. */
  sellPrice?: number;
  costs: CostLine[];
  /** Days to raise to a sellable state — used for profit-per-day. */
  days?: number;
}

export interface RaisingResult {
  /** Sum of all filled cost lines. */
  totalCost: number;
  /** sellPrice − totalCost. undefined if no sale price set. */
  profit?: number;
  /** profit / totalCost, as a ratio (0.5 = +50%). undefined if not computable. */
  marginRatio?: number;
  /** profit / days. undefined if no usable duration. */
  profitPerDay?: number;
}

/**
 * The kamas cost of a single line. Item-linked lines are priced from the shared
 * price map (unit price × quantity); an unknown price contributes 0.
 */
export function lineCost(line: CostLine, prices: PriceMap): number {
  if (line.itemId != null) {
    const unit = prices[line.itemId];
    return unit == null ? 0 : unit * (line.quantity ?? 0);
  }
  return line.amount ?? 0;
}

/** True when the line is priced from an item but that item has no known price. */
export function isMissingPrice(line: CostLine, prices: PriceMap): boolean {
  return line.itemId != null && prices[line.itemId] == null;
}

export function computeRaising(
  input: RaisingInput,
  prices: PriceMap,
): RaisingResult {
  const totalCost = input.costs.reduce(
    (sum, c) => sum + lineCost(c, prices),
    0,
  );

  let profit: number | undefined;
  let marginRatio: number | undefined;
  let profitPerDay: number | undefined;

  if (input.sellPrice != null) {
    profit = input.sellPrice - totalCost;
    if (totalCost > 0) marginRatio = profit / totalCost;
    if (input.days != null && input.days > 0) profitPerDay = profit / input.days;
  }

  return { totalCost, profit, marginRatio, profitPerDay };
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh manual cost line with a unique id. */
export function newCostLine(label = ""): CostLine {
  return { id: makeId(), label };
}

/** A cost line linked to a tracked item, priced × quantity. */
export function newItemCostLine(item: Item, quantity = 1): CostLine {
  return { id: makeId(), label: item.name, itemId: item.id, quantity };
}

/** Default budget lines to guide a first-time user. */
export function defaultRaisingInput(): RaisingInput {
  return {
    sellPrice: undefined,
    days: undefined,
    costs: [
      newCostLine("Achat dragodinde"),
      newCostLine("Nourriture"),
      newCostLine("Enclos / divers"),
    ],
  };
}
