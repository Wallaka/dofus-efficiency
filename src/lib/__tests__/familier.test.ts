import { describe, it, expect } from "vitest";
import {
  evaluateFood,
  rankFoods,
  PET_TARGET_XP,
  type FamilierFood,
} from "../familier";
import type { PriceMap } from "../../types";

const food = (itemId: string, xp?: number): FamilierFood => ({
  itemId,
  name: itemId,
  xp,
});

describe("evaluateFood", () => {
  it("costs a food from its XP and price against the target", () => {
    // Croquette enrichie: 500 XP @ 200 k, target 196 159.
    const prices: PriceMap = { croq: 200 };
    const r = evaluateFood(food("croq", 500), prices, PET_TARGET_XP);
    expect(r.unitsNeeded).toBe(Math.ceil(196159 / 500)); // 393
    expect(r.perXp).toBeCloseTo(200 / 500); // 0.4
    expect(r.totalCost).toBe(393 * 200); // 78 600
    expect(r.priced).toBe(true);
  });

  it("knows the unit count without a price (cost stays unknown)", () => {
    const r = evaluateFood(food("x", 1000), {}, 10000);
    expect(r.unitsNeeded).toBe(10);
    expect(r.totalCost).toBeUndefined();
    expect(r.perXp).toBeUndefined();
    expect(r.priced).toBe(false);
  });

  it("computes nothing when XP is missing", () => {
    const r = evaluateFood(food("x"), { x: 50 }, 10000);
    expect(r.unitsNeeded).toBeUndefined();
    expect(r.totalCost).toBeUndefined();
    expect(r.priced).toBe(false);
  });
});

describe("rankFoods", () => {
  it("orders by kamas/XP, priced first, then xp-only, then the rest", () => {
    const prices: PriceMap = { a: 100, b: 100, c: 100 };
    // a: 100/500 = 0.2 ; b: 100/200 = 0.5 ; c: no xp ; d: xp but no price.
    const ranked = rankFoods([
      evaluateFood(food("b", 200), prices, 10000),
      evaluateFood(food("c"), prices, 10000),
      evaluateFood(food("d", 300), {}, 10000),
      evaluateFood(food("a", 500), prices, 10000),
    ]);
    expect(ranked.map((r) => r.food.itemId)).toEqual(["a", "b", "d", "c"]);
  });
});
