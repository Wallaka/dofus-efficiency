import type { Item, PriceMap } from "../types";

/**
 * Profession (métier) leveling maths, from the modern Dofus (2.29+) model.
 *
 * Two well-established facts drive everything:
 *  1. The XP to go from job level L to L+1 is `20 × L`, so the cumulative XP to
 *     reach level N is `10 · N · (N−1)` (e.g. level 100 = 10·100·99 = 99 000).
 *  2. A successful craft grants `floor(20 × recipeLevel × ratio)`, where `ratio`
 *     drops with the gap between your job level and the recipe's level — so
 *     crafting an item *at* your level gives one level's worth of XP
 *     ("1 craft ≈ 1 level"), and out-levelled recipes give steadily less.
 *
 * `ratio` is Ankama's documented per-gap table (below), extended with a smooth
 * tail past gap 17. Matched against DofusDB, a level-1 recipe from 1→20 gives
 * ~528 crafts vs their 523 (~1 %); the residual is their internal rounding. The
 * cost side (from your prices) is exact, so kamas/XP is trustworthy either way.
 */

/**
 * XP kept when crafting a recipe `gap` levels below your job level (index = gap).
 * Ankama's exact table for gaps 0–17; larger gaps use a fitted tail
 * (≈0.29 at 18, 0.25 at 22, 0.10 at 55) that joins the table smoothly at 17.
 */
const XP_RATIO = [
  1.0, 0.91, 0.82, 0.75, 0.685, 0.63, 0.58, 0.54, 0.5, 0.47, 0.44, 0.415, 0.39,
  0.37, 0.35, 0.335, 0.32, 0.305,
] as const;

export function craftPenalty(gap: number): number {
  const g = Math.max(0, Math.floor(gap));
  return g < XP_RATIO.length ? XP_RATIO[g] : 7.045 / (g + 6.09);
}

/** XP required to advance from job level `level` to the next. */
export function xpToNextLevel(level: number): number {
  return 20 * Math.max(0, level);
}

/** Cumulative XP required to reach `level` (0 at level 1). */
export function cumulativeXp(level: number): number {
  const l = Math.max(1, level);
  return 10 * l * (l - 1);
}

/**
 * XP from one successful craft of a recipe of `recipeLevel`, by a crafter at
 * `jobLevel`, scaled by an XP coefficient (1 = none, 1.2 = +20 %). Floored like
 * the game (min 1 for a craftable recipe); 0 for a recipe above your level.
 */
export function xpPerCraft(
  jobLevel: number,
  recipeLevel: number,
  coef = 1,
): number {
  if (recipeLevel > jobLevel || recipeLevel <= 0) return 0;
  const xp = Math.floor(20 * recipeLevel * craftPenalty(jobLevel - recipeLevel) * coef);
  return Math.max(1, xp);
}

// --- Leveling plan --------------------------------------------------------

/** A recipe as the planner needs it: its result, level, slots, and ingredients. */
export interface MetierRecipe {
  recipeId: string;
  result: Item;
  resultLevel: number;
  /** Number of ingredient slots ("cases") — shown for info, not used for XP. */
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

/** Total XP to go from level `from` to level `to`. */
export function xpBetween(from: number, to: number): number {
  return cumulativeXp(Math.min(200, to)) - cumulativeXp(Math.max(1, from));
}

/** The full plan for reaching a target by spamming one chosen recipe. */
export interface RecipePlan {
  recipe: MetierRecipe;
  /** XP/craft at the starting level (it drifts down as you out-level the recipe). */
  xpPerCraft: number;
  /** Total successful crafts to go from `from` to `to` with this recipe. */
  crafts: number;
  /** crafts × recipe cost; undefined if any ingredient price is missing. */
  cost?: number;
  /** cost ÷ total XP; undefined if the cost is unknown. */
  costPerXp?: number;
  /** This recipe's ingredients scaled to the whole run — the shopping list. */
  shopping: PlanIngredient[];
  /** True when at least one ingredient price is missing. */
  incomplete: boolean;
}

/**
 * How many crafts of one recipe it takes to go from `fromLevel` to `toLevel`,
 * summed level by level so the growing out-level penalty is accounted for, plus
 * the resulting cost and shopping list. Assumes the recipe is craftable over the
 * range (its level ≤ fromLevel); callers filter to those.
 */
export function planRecipeToTarget(
  recipe: MetierRecipe,
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
): RecipePlan {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(200, Math.floor(toLevel));

  let crafts = 0;
  for (let level = from; level < to; level++) {
    const xpc = xpPerCraft(level, recipe.resultLevel, coef);
    if (xpc <= 0) continue;
    crafts += Math.ceil(xpToNextLevel(level) / xpc);
  }

  const unitCost = recipeCost(recipe, prices);
  const cost = unitCost != null ? unitCost * crafts : undefined;
  const totalXp = xpBetween(from, to);
  const costPerXp = cost != null && totalXp > 0 ? cost / totalXp : undefined;

  const shopping: PlanIngredient[] = recipe.ingredients.map((ing) => {
    const unit = prices[ing.item.id];
    const quantity = ing.quantity * crafts;
    return {
      item: ing.item,
      quantity,
      unitPrice: unit,
      subtotal: unit != null ? unit * quantity : undefined,
    };
  });

  return {
    recipe,
    xpPerCraft: xpPerCraft(from, recipe.resultLevel, coef),
    crafts,
    cost,
    costPerXp,
    shopping,
    incomplete: recipe.ingredients.some((ing) => prices[ing.item.id] == null),
  };
}

/**
 * Plan every recipe craftable at `fromLevel` for reaching `toLevel`, cheapest
 * first (by total cost; recipes with a missing price sort last, by fewest
 * crafts). The first entry is the recommended recipe.
 */
export function planRecipesToTarget(
  recipes: MetierRecipe[],
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
): RecipePlan[] {
  const from = Math.max(1, Math.floor(fromLevel));
  const plans = recipes
    .filter((r) => r.resultLevel <= from && xpPerCraft(from, r.resultLevel, coef) > 0)
    .map((r) => planRecipeToTarget(r, prices, fromLevel, toLevel, coef));

  plans.sort((a, b) => {
    if (a.cost == null && b.cost == null) return a.crafts - b.crafts;
    if (a.cost == null) return 1;
    if (b.cost == null) return -1;
    return a.cost - b.cost;
  });
  return plans;
}

/** One palier of the optimal path: a band of levels crafted with one recipe. */
export interface OptimalStep {
  fromLevel: number;
  toLevel: number;
  recipe: MetierRecipe;
  crafts: number;
  /** crafts × recipe cost; undefined if the recipe has a missing price. */
  cost?: number;
}

/** The cheapest route to the target, switching recipes as better ones unlock. */
export interface OptimalPlan {
  steps: OptimalStep[];
  totalCrafts: number;
  totalXp: number;
  totalCost?: number;
  avgCostPerXp?: number;
  shopping: PlanIngredient[];
  incomplete: boolean;
  /** Number of distinct recipes used along the way. */
  recipeCount: number;
}

/**
 * The cheapest-kamas leveling route from `fromLevel` to `toLevel`. Each level's
 * XP is independent, so the global minimum is the per-level minimum: at every
 * level pick the craftable recipe (level ≤ current, including ones that unlock
 * along the way) whose cost to clear that level is lowest. Consecutive levels
 * sharing a recipe are merged into paliers. Recipes with a missing price are
 * only used when nothing priced is craftable (then the plan is incomplete).
 */
export function buildOptimalPlan(
  recipes: MetierRecipe[],
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
): OptimalPlan {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(200, Math.floor(toLevel));

  const steps: OptimalStep[] = [];
  let usedUnpriced = false;

  for (let level = from; level < to; level++) {
    let bestPriced: { r: MetierRecipe; crafts: number; cost: number } | undefined;
    let bestFree: { r: MetierRecipe; crafts: number } | undefined;

    for (const r of recipes) {
      if (r.resultLevel > level) continue; // not craftable yet
      const xpc = xpPerCraft(level, r.resultLevel, coef);
      if (xpc <= 0) continue;
      const crafts = Math.ceil(xpToNextLevel(level) / xpc);
      const unit = recipeCost(r, prices);
      if (unit != null) {
        const cost = crafts * unit;
        if (!bestPriced || cost < bestPriced.cost) bestPriced = { r, crafts, cost };
      } else if (!bestFree || crafts < bestFree.crafts) {
        bestFree = { r, crafts };
      }
    }

    const pick = bestPriced ?? bestFree;
    if (!pick) continue; // no craftable recipe at this level
    // pick === bestPriced whenever a priced recipe exists, else bestFree.
    const cost = bestPriced ? bestPriced.cost : undefined;
    if (!bestPriced) usedUnpriced = true;

    const last = steps[steps.length - 1];
    if (last && last.recipe.recipeId === pick.r.recipeId) {
      last.crafts += pick.crafts;
      last.toLevel = level + 1;
      if (last.cost != null && cost != null) last.cost += cost;
    } else {
      steps.push({
        fromLevel: level,
        toLevel: level + 1,
        recipe: pick.r,
        crafts: pick.crafts,
        cost,
      });
    }
  }

  // Aggregate totals + shopping list across steps.
  const shoppingById = new Map<string, PlanIngredient>();
  let totalCrafts = 0;
  let totalCost: number | undefined = usedUnpriced ? undefined : 0;
  let incomplete = usedUnpriced;

  for (const step of steps) {
    totalCrafts += step.crafts;
    if (step.cost != null && totalCost != null) totalCost += step.cost;
    for (const ing of step.recipe.ingredients) {
      const qty = ing.quantity * step.crafts;
      const unit = prices[ing.item.id];
      if (unit == null) incomplete = true;
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

  const totalXp = xpBetween(from, to);
  return {
    steps,
    totalCrafts,
    totalXp,
    totalCost,
    avgCostPerXp: totalCost != null && totalXp > 0 ? totalCost / totalXp : undefined,
    shopping: [...shoppingById.values()],
    incomplete,
    recipeCount: new Set(steps.map((s) => s.recipe.recipeId)).size,
  };
}
