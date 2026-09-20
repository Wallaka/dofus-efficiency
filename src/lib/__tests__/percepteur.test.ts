import { describe, it, expect } from "vitest";
import {
  evaluatePercepteur,
  bestByNetPerHour,
  rememberZone,
  type PercepteurRow,
} from "../percepteur";

const row = (over: Partial<PercepteurRow>): PercepteurRow => ({
  id: over.id ?? "r",
  zone: over.zone ?? "Zone",
  ...over,
});

describe("evaluatePercepteur", () => {
  it("computes gross and net kamas per hour (potion deducted)", () => {
    // 85 000 kamas over 120 min, 3 000 potion.
    const r = evaluatePercepteur(row({ minutes: 120, rendement: 85000, potion: 3000 }));
    expect(r.perHour).toBe(85000 / 2); // 42 500
    expect(r.net).toBe(82000);
    expect(r.netPerHour).toBe(82000 / 2); // 41 000
  });

  it("treats a missing potion as zero", () => {
    const r = evaluatePercepteur(row({ minutes: 60, rendement: 25000 }));
    expect(r.perHour).toBe(25000);
    expect(r.net).toBe(25000);
    expect(r.netPerHour).toBe(25000);
  });

  it("leaves per-hour undefined without a time or rendement", () => {
    expect(evaluatePercepteur(row({ rendement: 1000 })).perHour).toBeUndefined();
    expect(evaluatePercepteur(row({ minutes: 60 })).netPerHour).toBeUndefined();
  });

  it("can go negative when the potion costs more than the loot", () => {
    const r = evaluatePercepteur(row({ minutes: 60, rendement: 1000, potion: 5000 }));
    expect(r.netPerHour).toBe(-4000);
  });
});

describe("bestByNetPerHour", () => {
  it("picks the highest net/hour, skipping uncostable rows", () => {
    const results = [
      evaluatePercepteur(row({ id: "a", minutes: 120, rendement: 85000, potion: 3000 })), // 41 000/h
      evaluatePercepteur(row({ id: "b", minutes: 240, rendement: 120000, potion: 8000 })), // 28 000/h
      evaluatePercepteur(row({ id: "c", rendement: 999999 })), // no time → skipped
    ];
    expect(bestByNetPerHour(results)?.row.id).toBe("a");
  });

  it("returns undefined when nothing is costable", () => {
    expect(bestByNetPerHour([evaluatePercepteur(row({ zone: "x" }))])).toBeUndefined();
  });
});

describe("rememberZone", () => {
  it("adds new zones and dedupes case-insensitively", () => {
    let zones: string[] = [];
    zones = rememberZone(zones, "Coin des Bouftous");
    zones = rememberZone(zones, "  coin des bouftous  "); // dup (trim + case)
    zones = rememberZone(zones, "Champs de Cania");
    zones = rememberZone(zones, ""); // ignored
    expect(zones).toEqual(["Coin des Bouftous", "Champs de Cania"]);
  });
});
