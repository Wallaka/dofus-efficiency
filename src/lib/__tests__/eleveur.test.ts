import { describe, it, expect } from "vitest";
import {
  enclosForLevel,
  computeEleveur,
  expectedQuantity,
  ENERGY_PER_ENCLOS,
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
    mountIds: ["4434"],
    ...overrides,
  };
}

// Prices: filet + indigo runes (Ga Pme 1558, Ré Per Eau 7560). No mangeoire
// price by default → food cost 0 but flagged.
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

  it("scales to the rotation, and per day by rotations/day (default 1)", () => {
    const r = computeEleveur(baseInput(), PRICES, 0, 10);
    expect(r.filtresPerCycle).toBeCloseTo(6, 6); // (1/10) × 60
    expect(r.profitPerCycle).toBeCloseTo(1425 * 60, 6);
    expect(r.profitPerDay).toBeCloseTo(1425 * 60, 6); // × 1 rotation/day
    const twice = computeEleveur(baseInput({ rotationsPerDay: 2 }), PRICES, 0, 10);
    expect(twice.profitPerDay).toBeCloseTo(1425 * 60 * 2, 6);
  });

  it("computes the mangeoire food cost (ceil per enclos × enclos ÷ slots)", () => {
    // Grand Extrait (id 33341) = 4000 energy @ 500 k. Per enclos:
    // ceil(39360 / 4000) = 10 mangeoires. 6 enclos → 60. Cost 60 × 500k.
    const prices = { ...PRICES, "33341": 500 };
    const r = computeEleveur(baseInput({ mangeoireId: "33341" }), prices, 0, 10);
    expect(ENERGY_PER_ENCLOS).toBe(39360);
    expect(r.mangeoiresPerEnclos).toBe(10);
    expect(r.mangeoiresPerCycle).toBe(60);
    expect(r.foodCostPerCycle).toBe(60 * 500);
    expect(r.raiseCostPerMount).toBeCloseTo((60 * 500) / 60, 6); // 500 / mount
    // profit drops by the food cost per mount vs the no-food case (1425).
    expect(r.profitPerMount).toBeCloseTo(1425 - 500, 6);
  });

  it("flags missing prices (filet + runes + mangeoire)", () => {
    const r = computeEleveur(baseInput({ mangeoireId: "33341" }), {}, 0, 10);
    expect(r.missingPriceItemIds.sort()).toEqual(["1558", "32530", "33341", "7560"]);
  });

  it("honours an explicit filet choice over the auto-best", () => {
    // Force the universal net (id 32521, 1 mount) instead of the level-200 best.
    const prices = { ...PRICES, "32521": 1000 };
    const r = computeEleveur(baseInput({ filetId: "32521" }), prices, 0);
    expect(r.filet?.id).toBe("32521");
    // 1 filet / 1 mount × 1000 = 1000 capture per mount.
    expect(r.captureCostPerMount).toBe(1000);
  });

  it("uses a brisage override for the mount when provided", () => {
    // Override indigo's runes with a single Ga Pme worth 100% of 10 @ 200 k.
    const override = {
      "4434": [
        { itemId: "1558", label: "Rune Ga Pme", img: "", chance: 1, quantityMin: 10, quantityMax: 10 },
      ],
    };
    const r = computeEleveur(baseInput(), { "1558": 200 }, 0, 10, override);
    expect(r.runes).toHaveLength(1);
    expect(r.grossRevenuePerMount).toBe(2000); // 10 × 200
  });

  it("has no filet or capture cost until a mount is chosen", () => {
    const r = computeEleveur({ level: 200, mountIds: [] }, PRICES, 0);
    expect(r.filet).toBeUndefined();
    expect(r.captureCostPerMount).toBe(0);
    expect(r.runes).toEqual([]);
  });

  it("diversifies: capacity split equally averages the runes across muldos", () => {
    // Indigo (Ré Per Eau, id 7560) + orchidée (Ré Per Feu, id 7457). Each mount
    // is half one, half the other → Ga Pme stays 0.5, each signature is 4.75/2.
    const r = computeEleveur(
      baseInput({ mountIds: ["4434", "4436"] }),
      PRICES,
      0,
      10,
    );
    const gaPme = r.runes.find((x) => x.itemId === "1558");
    const eau = r.runes.find((x) => x.itemId === "7560");
    const feu = r.runes.find((x) => x.itemId === "7457");
    expect(gaPme?.perMount).toBeCloseTo(0.5, 6); // 0.5/2 + 0.5/2
    expect(eau?.perMount).toBeCloseTo(4.75 / 2, 6);
    expect(feu?.perMount).toBeCloseTo(4.75 / 2, 6);
  });
});
