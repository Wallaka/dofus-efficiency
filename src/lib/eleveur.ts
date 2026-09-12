/**
 * Raising-profitability model for the éleveur (breeder) page.
 *
 * Deliberately generic: rather than hard-code Dofus breeding mechanics (food
 * types, serenity, maturity curves — which vary and change), the user lists the
 * costs of raising a mount and its expected sale price. We turn that into the
 * numbers that matter for a money-making decision: net profit, margin, and
 * profit per day (so it's comparable to crafting/farming).
 */

/** One cost line in the raising budget (e.g. "Achat dragodinde", "Nourriture"). */
export interface CostLine {
  id: string;
  label: string;
  /** Kamas. undefined = not filled in yet. */
  amount?: number;
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

export function computeRaising(input: RaisingInput): RaisingResult {
  const totalCost = input.costs.reduce((sum, c) => sum + (c.amount ?? 0), 0);

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

/** A fresh cost line with a unique id. */
export function newCostLine(label = ""): CostLine {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, label };
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
