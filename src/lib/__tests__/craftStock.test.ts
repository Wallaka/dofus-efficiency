import { describe, it, expect } from "vitest";
import { evaluateRecipe } from "../craft";
import type { Item, PriceMap, Recipe } from "../../types";

const items = new Map<string, Item>([
  ["res", { id: "res", name: "Résultat" }],
  ["a", { id: "a", name: "Ingr A" }],
  ["b", { id: "b", name: "Ingr B" }],
]);

const recipe: Recipe = {
  id: "r",
  resultItemId: "res",
  ingredients: [
    { itemId: "a", quantity: 10 },
    { itemId: "b", quantity: 5 },
  ],
};

const prices: PriceMap = { a: 100, b: 200, res: 5000 };

describe("evaluateRecipe with owned stock", () => {
  it("prices everything when no stock is given", () => {
    expect(evaluateRecipe(recipe, items, prices).craftCost).toBe(
      10 * 100 + 5 * 200, // 2000
    );
  });

  it("only prices the units not already owned", () => {
    // Own 4 of a (need 6) and 2 of b (need 3).
    const cost = evaluateRecipe(recipe, items, prices, { a: 4, b: 2 }).craftCost;
    expect(cost).toBe(6 * 100 + 3 * 200); // 1200
  });

  it("owning an ingredient in full costs nothing and needs no price", () => {
    // No price for b, but we own all 5 → craft cost is still known.
    const noBPrice: PriceMap = { a: 100, res: 5000 };
    const evalx = evaluateRecipe(recipe, items, noBPrice, { b: 5 });
    expect(evalx.craftCost).toBe(10 * 100); // 1000, b free
    expect(evalx.missingPriceItemIds).not.toContain("b");
  });

  it("clamps stock above the needed quantity (no negative cost)", () => {
    const cost = evaluateRecipe(recipe, items, prices, { a: 999 }).craftCost;
    expect(cost).toBe(5 * 200); // a fully covered, only b priced
  });
});
