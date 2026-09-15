import { describe, it, expect } from "vitest";
import { resolveBrisage } from "../brisageStore";
import { brisageFor, type RuneYield } from "../mounts";

describe("resolveBrisage", () => {
  it("returns the default yield when there's no override", () => {
    expect(resolveBrisage("4434", {})).toEqual(brisageFor("4434"));
  });

  it("returns the override when present", () => {
    const custom: RuneYield[] = [
      { itemId: "1558", label: "Rune Ga Pme", img: "", chance: 1, quantityMin: 2, quantityMax: 2 },
    ];
    expect(resolveBrisage("4434", { "4434": custom })).toBe(custom);
  });

  it("is empty for an unknown mount with no override", () => {
    expect(resolveBrisage("nope", {})).toEqual([]);
  });
});
