import { describe, it, expect } from "vitest";
import {
  enclosForLevel,
  computeEleveur,
  expectedQuantity,
  type EleveurInput,
} from "../eleveur";
import type { PriceMap } from "../../types";

describe("enclosForLevel", () => {
  it("is 0 below level 1", () => {
    expect(enclosForLevel(0)).toBe(0);
    expect(enclosForLevel(undefined)).toBe(0);
  });

  it("adds one enclos at each 40-level threshold", () => {
    expect(enclosForLevel(1)).toBe(1);
    expect(enclosForLevel(39)).toBe(1);
    expect(enclosForLevel(40)).toBe(2);
    expect(enclosForLevel(80)).toBe(3);
    expect(enclosForLevel(120)).toBe(4);
    expect(enclosForLevel(160)).toBe(5);
    expect(enclosForLevel(200)).toBe(6);
  });
});

describe("expectedQuantity", () => {
  it("is chance × mid-range, clamped and defaulted", () => {
    expect(expectedQuantity(0.5, 4, 15)).toBeCloseTo(4.75, 6);
    expect(expectedQuantity(0.5, 1, 1)).toBe(0.5);
    expect(expectedQuantity(undefined, 2, 2)).toBe(2); // chance defaults to 1
    expect(expectedQuantity(5, 3, 3)).toBe(3); // clamped to 1
  });
});

// Muldo indigo (id 4434, creature Muldo). At level 200 the best Muldo filet is
// "Filet multiplicateur de Muldo renforcé" (2–10 mounts/capture).
function baseInput(overrides: Partial<EleveurInput> = {}): EleveurInput {
  return {
    level: 200,
    mountId: "4434",
    mountCreature: "Muldo",
    raiseHours: 10,
    ...overrides,
  };
}

// Prices: filet + the indigo runes (Ga Pme 1558, Ré Per Eau 7560).
const PRICES: PriceMap = { "32530": 1000, "1558": 200, "7560": 300 };

describe("computeEleveur", () => {
  it("derives enclos, capacity and the auto filet", () => {
    const r = computeEleveur(baseInput(), PRICES, 0);
    expect(r.enclos).toBe(6);
    expect(r.capacity).toBe(10);
    expect(r.totalSlots).toBe(60);
    expect(r.filet?.name).toBe("Filet multiplicateur de Muldo renforcé");
  });

  it("splits filet cost across mounts caught (best case = max bound)", () => {
    // max bound 10 → 1 filet / 10 mounts × 1000 = 100 k capture per mount.
    const best = computeEleveur(baseInput(), PRICES, 0, 10);
    expect(best.captureCostPerMount).toBe(100);
    // worst case: 1 filet / 2 mounts × 1000 = 500 k.
    const worst = computeEleveur(baseInput(), PRICES, 0, 2);
    expect(worst.captureCostPerMount).toBe(500);
  });

  it("values brisage runes at their expected quantity", () => {
    const r = computeEleveur(baseInput(), PRICES, 0, 10);
    // Ga Pme: 0.5 × 200 = 100 ; Ré Per Eau: 0.5 × 9.5 × 300 = 1425 → 1525 gross.
    expect(r.grossRevenuePerMount).toBeCloseTo(1525, 6);
    expect(r.netRevenuePerMount).toBeCloseTo(1525, 6); // no tax
    expect(r.profitPerMount).toBeCloseTo(1425, 6); // − 100 capture
  });

  it("scales to the rotation and to a 24h day", () => {
    const r = computeEleveur(baseInput(), PRICES, 0, 10);
    expect(r.filtresPerCycle).toBeCloseTo(6, 6); // (1/10) × 60
    expect(r.profitPerCycle).toBeCloseTo(1425 * 60, 6);
    expect(r.profitPerDay).toBeCloseTo(1425 * 60 * (24 / 10), 6);
  });

  it("flags missing prices (filet + runes)", () => {
    const r = computeEleveur(baseInput(), {}, 0, 10);
    expect(r.missingPriceItemIds.sort()).toEqual(["1558", "32530", "7560"]);
  });

  it("has no filet or capture cost until a mount is chosen", () => {
    const r = computeEleveur(
      { level: 200, raiseHours: 10 },
      PRICES,
      0,
    );
    expect(r.filet).toBeUndefined();
    expect(r.captureCostPerMount).toBe(0);
    expect(r.runes).toEqual([]);
  });
});
