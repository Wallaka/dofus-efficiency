import type { Item, PriceMap } from "../types";

/**
 * Profession (métier) leveling maths, from the modern Dofus (2.29+) model.
 *
 * Two well-established facts drive everything:
 *  1. The XP to go from job level L to L+1 is `20 × L`, so the cumulative XP to
 *     reach level N is `10 · N · (N−1)` (e.g. level 100 = 10·100·99 = 99 000).
 *  2. A successful craft grants `floor(recipeLevel × ratio)`, where `ratio`
 *     drops with the gap between your job level and the recipe's level. So
 *     crafting an item *at* your level grants `recipeLevel` XP — about 1/20th of
 *     a level (you need `20 × level` to level up, i.e. ~20 crafts per level at
 *     gap 0) — and out-levelled recipes give steadily less.
 *
 * `ratio` is Ankama's closed form `1 / (1 + 0.1 · gap^1.1)` (see `craftPenalty`).
 * The base XP is the recipe's own level, confirmed in-game against DofusDB: a
 * level-5 recipe from 5→10 needs exactly 199 crafts, and its per-craft XP reads
 * 5, 4, 4, 3, 3 … as you out-level it; a level-21 recipe reads 21, 19, 17, 15.
 * The cost side (from your prices) is exact, so kamas/XP is trustworthy.
 */

/**
 * Fraction of a recipe's base XP kept when crafting it `gap` levels below your
 * job level. Ankama's closed form: `1 / (1 + 0.1 · gap^1.1)` — exact at every
 * gap. (This reproduces the old hand-typed 0–17 ratio table to the digit; the
 * table was just this formula rounded to three decimals, with an approximate
 * tail past gap 17 that this replaces.)
 */
export function craftPenalty(gap: number): number {
  const g = Math.max(0, Math.floor(gap));
  return 1 / (1 + 0.1 * Math.pow(g, 1.1));
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
 * `jobLevel`, scaled by an XP coefficient (1 = none, 1.2 = +20 %). The base XP is
 * the recipe's own level; the gap penalty and a floor (min 1 for a craftable
 * recipe) match the game exactly. Returns 0 for a recipe above your level.
 */
export function xpPerCraft(
  jobLevel: number,
  recipeLevel: number,
  coef = 1,
): number {
  if (recipeLevel > jobLevel || recipeLevel <= 0) return 0;
  const xp = Math.floor(recipeLevel * craftPenalty(jobLevel - recipeLevel) * coef);
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
  /** Every ingredient has a known price (opposite of incomplete). */
  priced: boolean;
  /** The recipe unlocks above the current level — can't be spammed from now. */
  locked: boolean;
  /** Level the count starts from (current level, or the unlock level if locked). */
  startLevel: number;
  /** Unit sell price of the crafted item (pre-tax), if known. */
  sellPrice?: number;
  /** What selling every crafted item brings back: crafts × sellPrice × (1−tax). 0 if unpriced. */
  revenue: number;
  /** cost − revenue (the real cost after reselling the output); undefined if cost unknown. */
  netCost?: number;
  /** netCost ÷ total XP; undefined if not computable. */
  netCostPerXp?: number;
  /** The crafted item's sell price is known (so the recoup is real, not 0). */
  resultPriced: boolean;
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
  taxRate = 0,
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

  // Revenue from reselling every crafted item, net of the HDV sell tax.
  const sellPrice = prices[recipe.result.id];
  const revenue = sellPrice != null ? sellPrice * (1 - taxRate) * crafts : 0;
  const netCost = cost != null ? cost - revenue : undefined;
  const netCostPerXp = netCost != null && totalXp > 0 ? netCost / totalXp : undefined;

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

  const incomplete = recipe.ingredients.some((ing) => prices[ing.item.id] == null);

  return {
    recipe,
    xpPerCraft: xpPerCraft(from, recipe.resultLevel, coef),
    crafts,
    cost,
    costPerXp,
    shopping,
    incomplete,
    priced: !incomplete,
    locked: recipe.resultLevel > from,
    startLevel: from,
    sellPrice,
    revenue,
    netCost,
    netCostPerXp,
    resultPriced: sellPrice != null,
  };
}

/**
 * Plan every recipe usable somewhere in `fromLevel`→`toLevel` (level ≤ target),
 * so the whole set is visible and priceable — not just the ones craftable now.
 * Craftable-now recipes come first, cheapest by total cost (unpriced last); then
 * the locked ones (unlock above the current level) by unlock level. A locked
 * recipe's count is measured from its unlock level, not the current level.
 */
export function planRecipesToTarget(
  recipes: MetierRecipe[],
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
  taxRate = 0,
): RecipePlan[] {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(200, Math.floor(toLevel));
  const plans = recipes
    .filter((r) => r.resultLevel >= 1 && r.resultLevel <= to)
    .map((r) => {
      const start = Math.max(from, r.resultLevel);
      const base = planRecipeToTarget(r, prices, start, to, coef, taxRate);
      return { ...base, locked: r.resultLevel > from, startLevel: start };
    });

  // Cheapest by GROSS ingredient cost (the real cost to level); unpriced last,
  // locked last. Resale is shown per row but never reorders the list, so pricing
  // a resell can't shuffle recipes around.
  plans.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1; // craftable-now first
    if (a.locked) return a.recipe.resultLevel - b.recipe.resultLevel; // then by unlock
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
  /** crafts × sell price × (1−tax); what reselling the output brings back. */
  revenue: number;
  /** cost − revenue; undefined if the cost is unknown. */
  netCost?: number;
}

/** The cheapest route to the target, switching recipes as better ones unlock. */
export interface OptimalPlan {
  steps: OptimalStep[];
  totalCrafts: number;
  totalXp: number;
  /** Gross ingredient cost (undefined if any level used an unpriced recipe). */
  totalCost?: number;
  /** Total resale revenue (net of tax) from the crafted output. */
  totalRevenue: number;
  /** totalCost − totalRevenue; undefined if the gross cost is unknown. */
  netCost?: number;
  /** netCost ÷ total XP. */
  netCostPerXp?: number;
  shopping: PlanIngredient[];
  incomplete: boolean;
  /** Number of distinct recipes used along the way. */
  recipeCount: number;
}

/**
 * The best leveling route from `fromLevel` to `toLevel`, chosen level by level
 * (each level's XP is independent, so the global optimum is the per-level
 * optimum). At every level it picks the craftable recipe (level ≤ current,
 * including ones that unlock along the way) that optimises `objective`:
 *
 *  - "gross" (default) → lowest GROSS ingredient cost: the genuinely cheapest way
 *    to *level*. Resale is then subtracted per step for display only, so entering
 *    a sell price can only lower the shown net cost, never reshuffle the recipes.
 *  - "net" → lowest NET cost (ingredients − resale, tax included): the most
 *    profitable route, since a cheap-to-craft item that doesn't resell can end up
 *    costing more than a pricier one you sell back. This one *does* let resale
 *    steer the path, so it can favour a recipe with more crafts when its output
 *    sells well (you level and recoup at the same time).
 *
 * Consecutive levels sharing a recipe are merged into paliers. Recipes with a
 * missing ingredient price are only used when nothing priced is craftable (then
 * the plan is incomplete).
 */
export function buildOptimalPlan(
  recipes: MetierRecipe[],
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
  taxRate = 0,
  objective: "gross" | "net" = "gross",
): OptimalPlan {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(200, Math.floor(toLevel));

  const steps: OptimalStep[] = [];
  let usedUnpriced = false;

  for (let level = from; level < to; level++) {
    let bestPriced:
      | { r: MetierRecipe; crafts: number; cost: number; revenue: number; net: number }
      | undefined;
    let bestFree: { r: MetierRecipe; crafts: number } | undefined;

    for (const r of recipes) {
      if (r.resultLevel > level) continue; // not craftable yet
      const xpc = xpPerCraft(level, r.resultLevel, coef);
      if (xpc <= 0) continue;
      const crafts = Math.ceil(xpToNextLevel(level) / xpc);
      const unit = recipeCost(r, prices);
      if (unit != null) {
        const cost = crafts * unit;
        const sell = prices[r.result.id];
        const revenue = sell != null ? sell * (1 - taxRate) * crafts : 0;
        const net = cost - revenue;
        // "gross" ranks by ingredient cost (cheapest to level); "net" by cost −
        // resale (most profitable — a cheap craft that doesn't resell can end up
        // dearer than a pricier one you sell back). See the function doc.
        const key = objective === "net" ? net : cost;
        const bestKey = bestPriced
          ? objective === "net"
            ? bestPriced.net
            : bestPriced.cost
          : undefined;
        if (bestKey === undefined || key < bestKey)
          bestPriced = { r, crafts, cost, revenue, net };
      } else if (!bestFree || crafts < bestFree.crafts) {
        bestFree = { r, crafts };
      }
    }

    const pick = bestPriced ?? bestFree;
    if (!pick) continue; // no craftable recipe at this level
    const cost = bestPriced ? bestPriced.cost : undefined;
    const revenue = bestPriced ? bestPriced.revenue : 0;
    if (!bestPriced) usedUnpriced = true;

    const last = steps[steps.length - 1];
    if (last && last.recipe.recipeId === pick.r.recipeId) {
      last.crafts += pick.crafts;
      last.toLevel = level + 1;
      if (last.cost != null && cost != null) last.cost += cost;
      last.revenue += revenue;
      last.netCost = last.cost != null ? last.cost - last.revenue : undefined;
    } else {
      steps.push({
        fromLevel: level,
        toLevel: level + 1,
        recipe: pick.r,
        crafts: pick.crafts,
        cost,
        revenue,
        netCost: cost != null ? cost - revenue : undefined,
      });
    }
  }

  // Aggregate totals + shopping list across steps.
  const shoppingById = new Map<string, PlanIngredient>();
  let totalCrafts = 0;
  let totalCost: number | undefined = usedUnpriced ? undefined : 0;
  let totalRevenue = 0;
  let incomplete = usedUnpriced;

  for (const step of steps) {
    totalCrafts += step.crafts;
    if (step.cost != null && totalCost != null) totalCost += step.cost;
    totalRevenue += step.revenue;
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
  const netCost = totalCost != null ? totalCost - totalRevenue : undefined;
  return {
    steps,
    totalCrafts,
    totalXp,
    totalCost,
    totalRevenue,
    netCost,
    netCostPerXp: netCost != null && totalXp > 0 ? netCost / totalXp : undefined,
    shopping: [...shoppingById.values()],
    incomplete,
    recipeCount: new Set(steps.map((s) => s.recipe.recipeId)).size,
  };
}
