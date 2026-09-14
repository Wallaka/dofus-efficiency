import { describe, it, expect } from "vitest";
import { effectiveAvitons, avitonUnitValue } from "../avis";

describe("effectiveAvitons", () => {
  it("returns the full count when the quest is done (not chasse-only)", () => {
    expect(effectiveAvitons(100, false)).toBe(100);
    expect(effectiveAvitons(15, false)).toBe(15);
  });

  it("halves the count when done via the legendary hunt alone", () => {
    expect(effectiveAvitons(100, true)).toBe(50);
    expect(effectiveAvitons(20, true)).toBe(10);
  });

  it("rounds an odd count down when halving", () => {
    expect(effectiveAvitons(15, true)).toBe(7);
    expect(effectiveAvitons(1, true)).toBe(0);
  });
});

describe("avitonUnitValue", () => {
  it("derives the per-aviton price from a batch", () => {
    expect(avitonUnitValue(100, 5000)).toBe(50);
  });

  it("is 0 when the batch is unset", () => {
    expect(avitonUnitValue(0, 5000)).toBe(0);
    expect(avitonUnitValue(100, 0)).toBe(0);
  });
});
