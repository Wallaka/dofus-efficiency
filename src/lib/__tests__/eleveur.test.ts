import { describe, it, expect } from "vitest";
import {
  slotsForLevel,
  computeEleveur,
  outputExpectedQty,
  newBreakpoint,
  type EleveurInput,
  type LevelBreakpoint,
} from "../eleveur";
import type { PriceMap } from "../../types";

const TABLE: LevelBreakpoint[] = [
  newBreakpoint(1, 1, 10),
  newBreakpoint(30, 2, 10),
  newBreakpoint(60, 3, 20),
];

describe("slotsForLevel", () => {
  it("returns no slots below the first threshold or with an empty table", () => {
    expect(slotsForLevel(0, TABLE)).toEqual({ enclos: 0, capacity: 0 });
    expect(slotsForLevel(50, [])).toEqual({ enclos: 0, capacity: 0 });
    expect(slotsForLevel(undefined, TABLE)).toEqual({ enclos: 0, capacity: 0 });
  });

  it("keeps the last row whose threshold is reached", () => {
    expect(slotsForLevel(1, TABLE)).toEqual({ enclos: 1, capacity: 10 });
    expect(slotsForLevel(29, TABLE)).toEqual({ enclos: 1, capacity: 10 });
    expect(slotsForLevel(30, TABLE)).toEqual({ enclos: 2, capacity: 10 });
    expect(slotsForLevel(59, TABLE)).toEqual({ enclos: 2, capacity: 10 });
    expect(slotsForLevel(60, TABLE)).toEqual({ enclos: 3, capacity: 20 });
    expect(slotsForLevel(200, TABLE)).toEqual({ enclos: 3, capacity: 20 });
  });

  it("is order-independent (rows get sorted)", () => {
    const shuffled = [TABLE[2], TABLE[0], TABLE[1]];
    expect(slotsForLevel(30, shuffled)).toEqual({ enclos: 2, capacity: 10 });
  });
});

describe("outputExpectedQty", () => {
  it("is chance × mid-range quantity", () => {
    // 50% of 4–15 → 0.5 × 9.5 = 4.75
    expect(outputExpectedQty({ id: "x", itemId: "r", label: "r", chance: 0.5, quantityMin: 4, quantityMax: 15 })).toBeCloseTo(4.75, 6);
    // 50% of a fixed 1 → 0.5
    expect(outputExpectedQty({ id: "x", itemId: "r", label: "r", chance: 0.5, quantityMin: 1, quantityMax: 1 })).toBe(0.5);
  });

  it("defaults chance to 1 and clamps it to [0,1]", () => {
    expect(outputExpectedQty({ id: "x", itemId: "r", label: "r", quantityMin: 2, quantityMax: 2 })).toBe(2);
    expect(outputExpectedQty({ id: "x", itemId: "r", label: "r", chance: 5, quantityMin: 3, quantityMax: 3 })).toBe(3);
  });
});

function baseInput(overrides: Partial<EleveurInput> = {}): EleveurInput {
  return {
    level: 60, // → 3 enclos × 20 = 60 slots with TABLE
    breakpoints: TABLE,
    captureFiltres: 2,
    filtreItemId: "filtre",
    raiseDays: 5,
    raiseCosts: [
      { id: "c1", label: "Nourriture", itemId: "food", quantity: 10 },
    ],
    outputs: [
      { id: "o1", itemId: "rune", label: "Rune Pa", chance: 1, quantityMin: 3, quantityMax: 3 },
    ],
    ...overrides,
  };
}

const PRICES: PriceMap = { filtre: 100, food: 5, rune: 400 };

describe("computeEleveur", () => {
  it("computes per-mount economics with no tax", () => {
    const r = computeEleveur(baseInput(), PRICES, 0);
    // capture: 2 filtres × 100 = 200 ; food: 10 × 5 = 50 → cost 250
    expect(r.captureCostPerMount).toBe(200);
    expect(r.raiseCostPerMount).toBe(50);
    expect(r.costPerMount).toBe(250);
    // revenue: 3 runes × 400 = 1200 ; profit 1200 − 250 = 950
    expect(r.grossRevenuePerMount).toBe(1200);
    expect(r.netRevenuePerMount).toBe(1200);
    expect(r.profitPerMount).toBe(950);
    expect(r.marginRatio).toBeCloseTo(950 / 250, 6);
  });

  it("applies HDV tax to rune revenue only", () => {
    const r = computeEleveur(baseInput(), PRICES, 0.02);
    expect(r.taxPerMount).toBeCloseTo(24, 6); // 1200 × 0.02
    expect(r.netRevenuePerMount).toBeCloseTo(1176, 6);
    expect(r.profitPerMount).toBeCloseTo(926, 6); // 1176 − 250
  });

  it("scales to the full enclos rotation and per day", () => {
    const r = computeEleveur(baseInput(), PRICES, 0);
    expect(r.totalSlots).toBe(60);
    expect(r.filtresPerCycle).toBe(120); // 2 × 60
    expect(r.filtresCostPerCycle).toBe(200 * 60);
    expect(r.profitPerCycle).toBe(950 * 60);
    expect(r.profitPerDay).toBeCloseTo((950 * 60) / 5, 6);
  });

  it("derives slots from the level but lets an override win", () => {
    const r = computeEleveur(
      baseInput({ enclosOverride: 1, capacityOverride: 5 }),
      PRICES,
      0,
    );
    expect(r.derivedEnclos).toBe(3);
    expect(r.derivedCapacity).toBe(20);
    expect(r.enclos).toBe(1);
    expect(r.capacity).toBe(5);
    expect(r.totalSlots).toBe(5);
  });

  it("flags missing prices (filtre, food, runes) and treats them as 0", () => {
    const r = computeEleveur(baseInput(), { rune: 400 }, 0);
    expect(r.missingPriceItemIds.sort()).toEqual(["filtre", "food"]);
    expect(r.captureCostPerMount).toBe(0);
    expect(r.raiseCostPerMount).toBe(0);
    expect(r.grossRevenuePerMount).toBe(1200);
  });

  it("does not count the filtre as missing when no capture is needed", () => {
    const r = computeEleveur(baseInput({ captureFiltres: 0 }), { rune: 400, food: 5 }, 0);
    expect(r.missingPriceItemIds).not.toContain("filtre");
    expect(r.captureCostPerMount).toBe(0);
  });

  it("splits filet cost across mounts caught per capture (4th arg)", () => {
    // 2 filets/capture, catches 2 mounts → 1 filet per mount → 100 k capture.
    const r = computeEleveur(baseInput(), PRICES, 0, 2);
    expect(r.captureCostPerMount).toBe(100);
    expect(r.filtresPerCycle).toBe(60); // (2 / 2) × 60 slots
    // profit rises by the 100 k saved vs the 1-mount case.
    expect(r.profitPerMount).toBe(1050);
  });

  it("treats mountsPerCapture below 1 as 1", () => {
    const r = computeEleveur(baseInput(), PRICES, 0, 0);
    expect(r.captureCostPerMount).toBe(200); // 2 filtres × 100, 1 mount
  });

  it("defaults mountsPerCapture to the input's max bound", () => {
    const r = computeEleveur(
      baseInput({ mountsPerCaptureMin: 1, mountsPerCaptureMax: 4 }),
      PRICES,
      0,
    );
    // max = 4 → 2 filtres / 4 mounts × 100 = 50 k capture per mount.
    expect(r.captureCostPerMount).toBe(50);
  });

  it("charges nothing (and flags nothing) when no filet is selected", () => {
    const r = computeEleveur(
      baseInput({ filtreItemId: undefined }),
      { rune: 400, food: 5 },
      0,
    );
    expect(r.captureCostPerMount).toBe(0);
    expect(r.missingPriceItemIds).toEqual([]);
  });

  it("leaves margin and per-day undefined when not computable", () => {
    const noCost = computeEleveur(
      baseInput({ captureFiltres: 0, raiseCosts: [] }),
      { rune: 400 },
      0,
    );
    expect(noCost.marginRatio).toBeUndefined();
    const noDays = computeEleveur(baseInput({ raiseDays: undefined }), PRICES, 0);
    expect(noDays.profitPerDay).toBeUndefined();
  });
});
