import { describe, it, expect } from "vitest";
import {
  xpToNextLevel,
  cumulativeXp,
  craftPenalty,
  xpPerCraft,
  xpBetween,
  planRecipeToTarget,
  planRecipesToTarget,
  buildOptimalPlan,
  type MetierRecipe,
} from "../metierXp";
import type { PriceMap } from "../../types";

const recipe = (
  id: string,
  resultLevel: number,
  ings: [string, number][],
): MetierRecipe => ({
  recipeId: id,
  result: { id: `res-${id}`, name: id },
  resultLevel,
  slots: ings.length,
  ingredients: ings.map(([itemId, quantity]) => ({
    item: { id: itemId, name: itemId },
    quantity,
  })),
});

describe("XP formula", () => {
  it("uses 20 × level per level and 10·N·(N−1) cumulative", () => {
    expect(xpToNextLevel(100)).toBe(2000);
    expect(cumulativeXp(100)).toBe(99000);
    expect(cumulativeXp(1)).toBe(0);
    // cumulative diff equals the per-level requirement
    expect(cumulativeXp(101) - cumulativeXp(100)).toBe(xpToNextLevel(100));
  });

  it("penalises out-levelled recipes (1 at gap 0, 0.5 at gap 8)", () => {
    expect(craftPenalty(0)).toBe(1);
    expect(craftPenalty(8)).toBeCloseTo(0.5);
  });

  it("crafting at your level yields exactly one level of XP", () => {
    expect(xpPerCraft(100, 100)).toBe(xpToNextLevel(100)); // 2000
  });

  it("applies the gap penalty, the coefficient, and blocks over-level recipes", () => {
    expect(xpPerCraft(108, 100)).toBe(1000); // 20×100×0.5
    expect(xpPerCraft(100, 100, 1.2)).toBe(2400);
    expect(xpPerCraft(50, 60)).toBe(0); // recipe above job level
  });
});

describe("planRecipeToTarget", () => {
  const prices: PriceMap = { b: 10 };

  it("sums crafts level by level (penalty grows) with cost and shopping", () => {
    // recipe level 10, 1 ingredient ×2 @10 → unit cost 20.
    // lvl10: xpc=200, need 200 → 1 craft. lvl11: xpc=round(200×8/9)=178, need 220 → 2.
    const plan = planRecipeToTarget(recipe("ring", 10, [["b", 2]]), prices, 10, 12, 1);
    expect(plan.crafts).toBe(3);
    expect(plan.cost).toBe(60);
    expect(plan.costPerXp).toBeCloseTo(60 / xpBetween(10, 12));
    expect(plan.incomplete).toBe(false);
    expect(plan.shopping[0]).toMatchObject({ quantity: 6, subtotal: 60 });
  });

  it("flags incomplete when a price is missing", () => {
    const plan = planRecipeToTarget(recipe("ring", 10, [["z", 2]]), prices, 10, 12, 1);
    expect(plan.incomplete).toBe(true);
    expect(plan.cost).toBeUndefined();
    expect(plan.crafts).toBe(3); // crafts don't depend on price
  });

  it("subtracts resale revenue (net of tax) to get net cost", () => {
    // recipe level 1, 1× "a" @10; result "res-R" sells for 30.
    // 1→3: lvl1 1 craft, lvl2 ceil(40/18)=3 → 4 crafts. cost = 4×10 = 40.
    const r = recipe("R", 1, [["a", 1]]);
    const withPrices = { a: 10, "res-R": 30 };

    const noTax = planRecipeToTarget(r, withPrices, 1, 3, 1, 0);
    expect(noTax.crafts).toBe(4);
    expect(noTax.cost).toBe(40);
    expect(noTax.revenue).toBe(120); // 30 × 4
    expect(noTax.netCost).toBe(-80); // profit while leveling
    expect(noTax.resultPriced).toBe(true);

    const taxed = planRecipeToTarget(r, withPrices, 1, 3, 1, 0.5);
    expect(taxed.revenue).toBe(60); // 30 × 0.5 × 4
    expect(taxed.netCost).toBe(-20);
  });

  it("matches the DofusDB reference for a level-1 recipe 1→20 (523) closely", () => {
    // Ankama's exact ratio table + floored XP gives 528 vs DofusDB's 523 (~1%).
    const plan = planRecipeToTarget(recipe("lvl1", 1, [["b", 1]]), prices, 1, 20, 1);
    expect(plan.crafts).toBe(528);
  });
});

describe("planRecipesToTarget", () => {
  const prices: PriceMap = { a: 100, b: 10 };
  it("lists craftable-now cheapest-first, unpriced last, then locked recipes", () => {
    const recipes = [
      recipe("cheap", 40, [["b", 5]]), // cost 50
      recipe("dear", 40, [["a", 5]]), // cost 500
      recipe("noprice", 40, [["z", 1]]), // unknown cost → after priced
      recipe("locked", 70, [["b", 1]]), // unlocks at 70 → last, flagged locked
    ];
    const plans = planRecipesToTarget(recipes, prices, 60, 80, 1);
    expect(plans.map((p) => p.recipe.recipeId)).toEqual([
      "cheap",
      "dear",
      "noprice",
      "locked",
    ]);
    expect(plans[0].cost!).toBeLessThan(plans[1].cost!);
    const locked = plans[3];
    expect(locked.locked).toBe(true);
    expect(locked.startLevel).toBe(70); // counted from its unlock level
    expect(plans[2].priced).toBe(false); // "noprice" flagged unpriced
    expect(plans[0].priced).toBe(true);
  });
});

describe("buildOptimalPlan", () => {
  const prices: PriceMap = { a: 1, b: 1 };
  const recipes = [
    recipe("A", 1, [["a", 1]]), // craftable from level 1
    recipe("B", 4, [["b", 1]]), // unlocks at level 4, higher base XP → cheaper then
  ];

  it("switches to a cheaper recipe when it unlocks", () => {
    const plan = buildOptimalPlan(recipes, prices, 1, 6, 1);
    expect(plan.recipeCount).toBe(2);
    expect(plan.steps.map((s) => s.recipe.recipeId)).toEqual(["A", "B"]);
    expect(plan.steps[1].fromLevel).toBe(4); // B kicks in exactly at its unlock level
  });

  it("is never more expensive than spamming a single recipe", () => {
    const optimal = buildOptimalPlan(recipes, prices, 1, 20, 1);
    const fixedA = planRecipeToTarget(recipes[0], prices, 1, 20, 1);
    expect(optimal.totalCost!).toBeLessThanOrEqual(fixedA.cost!);
  });

  it("keeps the same path when a resale price is entered (resale is display-only)", () => {
    // "cheap" clears each level in 1 craft @ cost 1; "spam" needs many crafts of
    // a low-XP recipe. Pricing a fat resale on "spam" must NOT hijack the path
    // into it just because reselling looks profitable — the path stays cheapest
    // to *level* (gross cost), and resale only lowers the reported net cost.
    const rs = [
      recipe("cheap", 10, [["a", 1]]), // level 10, best XP → fewest crafts
      recipe("spam", 1, [["b", 1]]), // level 1, tiny XP → many crafts, cheap unit
    ];
    const base = buildOptimalPlan(rs, prices, 10, 15, 1);
    const withResale = buildOptimalPlan(rs, { ...prices, "res-spam": 1000 }, 10, 15, 1, 0.02);

    // Same recipes, same craft counts before and after pricing the resale.
    expect(withResale.steps.map((s) => s.recipe.recipeId)).toEqual(
      base.steps.map((s) => s.recipe.recipeId),
    );
    expect(withResale.totalCrafts).toBe(base.totalCrafts);
    expect(withResale.totalCost).toBe(base.totalCost); // gross cost unchanged
    // Resale still shows up as revenue in the display totals.
    expect(withResale.totalRevenue).toBe(0); // "spam" isn't in the path, so nothing to resell
  });
});
