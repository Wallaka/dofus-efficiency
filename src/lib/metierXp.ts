import type { Item, PriceMap } from "../types";

/**
 * Profession (métier) leveling maths.
 *
 * IMPORTANT — these XP numbers are an *estimate*. Dofus doesn't publish the
 * craft-XP formula, and it differs between versions; the values below are the
 * widely-used community model (XP by ingredient-slot count, with a level ceiling
 * per slot count). They're isolated here so they're trivial to correct once we
 * confirm the real numbers from the game. The UI labels the XP as estimated.
 *
 * The *cost* side (from the shared price store) is exact — so "kamas per XP",
 * the metric that actually decides what's cheapest to craft, is as trustworthy
 * as your prices, regardless of the XP model's precision.
 */

/** XP granted by one successful craft, by number of ingredient slots ("cases"). */
export const SLOT_XP: Record<number, number> = {
  1: 1,
  2: 10,
  3: 25,
  4: 50,
  5: 100,
  6: 250,
  7: 500,
  8: 1000,
};

/** Approx. job level at which a recipe of N slots stops giving XP. */
export const SLOT_CEILING: Record<number, number> = {
  1: 40,
  2: 60,
  3: 80,
  4: 100,
  5: 200,
  6: 200,
  7: 200,
  8: 200,
};

/** Clamp a slot count to the 1..8 range the tables are keyed on. */
function slotKey(slots: number): number {
  if (slots <= 1) return 1;
  if (slots >= 8) return 8;
  return slots;
}

/** Base XP for a successful craft of a recipe with `slots` ingredient slots. */
export function slotXp(slots: number): number {
  if (slots <= 0) return 0;
  return SLOT_XP[slotKey(slots)];
}

/** The job level beyond which this recipe no longer gives XP. */
export function slotCeiling(slots: number): number {
  if (slots <= 0) return 0;
  return SLOT_CEILING[slotKey(slots)];
}

/** Does a recipe of `slots` slots still grant XP to a crafter at `jobLevel`? */
export function givesXpAt(jobLevel: number, slots: number): boolean {
  return slots > 0 && jobLevel < slotCeiling(slots);
}

/** XP per successful craft, scaled by an XP coefficient (1 = none, 1.2 = +20 %). */
export function xpPerCraft(slots: number, coef = 1): number {
  return Math.round(slotXp(slots) * coef);
}

// --- Leveling plan --------------------------------------------------------

/** A recipe as the planner needs it: its result, slot count, and ingredients. */
export interface MetierRecipe {
  recipeId: string;
  result: Item;
  resultLevel: number;
  slots: number;
  ingredients: { item: Item; quantity: number }[];
}

/** One aggregated ingredient line (a step's or the whole plan's shopping list). */
export interface PlanIngredient {
  item: Item;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
}

/** One palier: a band of levels crafted with a single chosen recipe. */
export interface MetierStep {
  fromLevel: number;
  toLevel: number;
  recipe: MetierRecipe;
  xpPerCraft: number;
  crafts: number;
  /** recipe cost × crafts; undefined if any ingredient price is missing. */
  cost?: number;
  /** cost per XP for this step; undefined if the cost is unknown. */
  costPerXp?: number;
  ingredients: PlanIngredient[];
}

export interface MetierPlan {
  steps: MetierStep[];
  totalCrafts: number;
  totalXp: number;
  /** undefined if any step's cost is unknown. */
  totalCost?: number;
  /** undefined if the total cost is unknown. */
  avgCostPerXp?: number;
  shopping: PlanIngredient[];
  /** True when at least one ingredient price is missing (totals are partial). */
  incomplete: boolean;
  /** First level with no XP-giving recipe available, if the plan can't reach the target. */
  stuckAtLevel?: number;
}

/** A recipe scored for a given level: XP/craft, cost/craft and cost-per-XP. */
export interface RankedRecipe {
  recipe: MetierRecipe;
  xpPerCraft: number;
  cost?: number;
  costPerXp?: number;
}

/**
 * Rank a job's recipes for a crafter at `level` by cost-per-XP (cheapest first).
 * Needs no XP curve — the safety net when the curve can't be loaded. Recipes
 * with a missing price sort last (by highest XP/craft).
 */
export function rankRecipes(
  recipes: MetierRecipe[],
  prices: PriceMap,
  level: number,
  coef = 1,
): RankedRecipe[] {
  const ranked = recipes
    .filter((r) => givesXpAt(level, r.slots))
    .map((r) => {
      const xpc = xpPerCraft(r.slots, coef);
      const cost = recipeCost(r, prices);
      return {
        recipe: r,
        xpPerCraft: xpc,
        cost,
        costPerXp: cost != null && xpc > 0 ? cost / xpc : undefined,
      };
    });
  ranked.sort((a, b) => {
    if (a.costPerXp == null && b.costPerXp == null)
      return b.xpPerCraft - a.xpPerCraft;
    if (a.costPerXp == null) return 1;
    if (b.costPerXp == null) return -1;
    return a.costPerXp - b.costPerXp;
  });
  return ranked;
}

/** Sum a recipe's ingredient cost; undefined if any price is missing. */
export function recipeCost(
  recipe: MetierRecipe,
  prices: PriceMap,
): number | undefined {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const unit = prices[ing.item.id];
    if (unit == null) return undefined;
    total += unit * ing.quantity;
  }
  return total;
}

/**
 * Pick the best recipe for a crafter at `level`: the one giving XP there with the
 * lowest cost-per-XP. Recipes with a missing price can't be costed, so they're
 * only used (by highest XP/craft) when nothing priced is available — the step
 * then shows an unknown cost rather than hiding the palier.
 */
function pickRecipe(
  recipes: MetierRecipe[],
  level: number,
  prices: PriceMap,
  coef: number,
): MetierRecipe | undefined {
  let bestPriced: { r: MetierRecipe; costPerXp: number } | undefined;
  let bestUnpriced: { r: MetierRecipe; xpc: number } | undefined;

  for (const r of recipes) {
    if (!givesXpAt(level, r.slots)) continue;
    const xpc = xpPerCraft(r.slots, coef);
    if (xpc <= 0) continue;
    const cost = recipeCost(r, prices);
    if (cost != null) {
      const cpx = cost / xpc;
      if (!bestPriced || cpx < bestPriced.costPerXp) bestPriced = { r, costPerXp: cpx };
    } else if (!bestUnpriced || xpc > bestUnpriced.xpc) {
      bestUnpriced = { r, xpc };
    }
  }
  return (bestPriced ?? bestUnpriced)?.r;
}

/**
 * Build a leveling plan from `fromLevel` to `toLevel` for one job.
 *
 * `xpCurve[l]` is the cumulative job XP required to reach level `l` (so the XP
 * from level a→b is `xpCurve[b] − xpCurve[a]`). Levels are walked one at a time,
 * the cheapest valid recipe is chosen for each, and consecutive levels sharing a
 * recipe are merged into one palier.
 */
export function buildLevelingPlan(
  recipes: MetierRecipe[],
  prices: PriceMap,
  xpCurve: number[],
  fromLevel: number,
  toLevel: number,
  coef = 1,
): MetierPlan {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(xpCurve.length - 1, Math.floor(toLevel));

  const steps: MetierStep[] = [];
  let stuckAtLevel: number | undefined;

  for (let level = from; level < to; level++) {
    const xpHere = xpCurve[level + 1] - xpCurve[level];
    if (!(xpHere > 0)) continue;

    const recipe = pickRecipe(recipes, level, prices, coef);
    if (!recipe) {
      stuckAtLevel = level;
      break;
    }

    const xpc = xpPerCraft(recipe.slots, coef);
    const crafts = Math.ceil(xpHere / xpc);

    const last = steps[steps.length - 1];
    if (last && last.recipe.recipeId === recipe.recipeId) {
      last.toLevel = level + 1;
      last.crafts += crafts;
    } else {
      steps.push({
        fromLevel: level,
        toLevel: level + 1,
        recipe,
        xpPerCraft: xpc,
        crafts,
        ingredients: [],
      });
    }
  }

  // Cost + per-step and whole-plan shopping lists.
  const shoppingById = new Map<string, PlanIngredient>();
  let incomplete = false;
  let totalCrafts = 0;
  let totalXp = 0;
  let totalCost: number | undefined = 0;

  for (const step of steps) {
    totalCrafts += step.crafts;
    totalXp += xpCurve[step.toLevel] - xpCurve[step.fromLevel];

    const unitCost = recipeCost(step.recipe, prices);
    if (unitCost != null) {
      step.cost = unitCost * step.crafts;
      step.costPerXp = step.xpPerCraft > 0 ? unitCost / step.xpPerCraft : undefined;
      if (totalCost != null) totalCost += step.cost;
    } else {
      incomplete = true;
      totalCost = undefined;
    }

    for (const ing of step.recipe.ingredients) {
      const qty = ing.quantity * step.crafts;
      const unit = prices[ing.item.id];
      if (unit == null) incomplete = true;
      step.ingredients.push({
        item: ing.item,
        quantity: qty,
        unitPrice: unit,
        subtotal: unit != null ? unit * qty : undefined,
      });
      const agg = shoppingById.get(ing.item.id);
      if (agg) {
        agg.quantity += qty;
        agg.subtotal = agg.unitPrice != null ? agg.unitPrice * agg.quantity : undefined;
      } else {
        shoppingById.set(ing.item.id, {
          item: ing.item,
          quantity: qty,
          unitPrice: unit,
          subtotal: unit != null ? unit * qty : undefined,
        });
      }
    }
  }

  const avgCostPerXp =
    totalCost != null && totalXp > 0 ? totalCost / totalXp : undefined;

  return {
    steps,
    totalCrafts,
    totalXp,
    totalCost,
    avgCostPerXp,
    shopping: [...shoppingById.values()],
    incomplete,
    stuckAtLevel,
  };
}
