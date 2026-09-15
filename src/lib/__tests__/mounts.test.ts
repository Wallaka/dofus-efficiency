import { describe, it, expect } from "vitest";
import { MULDOS, MOUNTS, mountById, brisageFor } from "../mounts";

describe("mounts", () => {
  it("lists the five wild capturable muldos", () => {
    expect(MULDOS).toHaveLength(5);
    expect(MULDOS.every((m) => m.creature === "Muldo")).toBe(true);
    expect(MULDOS.map((m) => m.name)).toContain("Muldo doré");
  });

  it("exposes them through MOUNTS with unique ids", () => {
    expect(MOUNTS).toHaveLength(MULDOS.length);
    expect(new Set(MOUNTS.map((m) => m.id)).size).toBe(MOUNTS.length);
  });

  it("looks up by id and misses unknown/undefined", () => {
    expect(mountById("4438")?.name).toBe("Muldo doré");
    expect(mountById("nope")).toBeUndefined();
    expect(mountById(undefined)).toBeUndefined();
  });
});

describe("brisageFor", () => {
  it("gives every muldo a 50% Ga Pme + a 50% signature rune", () => {
    for (const m of MULDOS) {
      const runes = brisageFor(m.id);
      expect(runes.length).toBe(2);
      // Ga Pme: 50% of 1.
      expect(runes[0].label).toBe("Rune Ga Pme");
      expect(runes[0].chance).toBe(0.5);
      expect(runes[0].quantityMin).toBe(1);
      expect(runes[0].quantityMax).toBe(1);
      // Signature rune: 50% chance.
      expect(runes[1].chance).toBe(0.5);
    }
  });

  it("uses 4–15 for resistance runes and 20–45 for Rune Pui (doré)", () => {
    const air = brisageFor("4435")[1]; // ébène → Ré Per Air
    expect([air.quantityMin, air.quantityMax]).toEqual([4, 15]);
    const pui = brisageFor("4438")[1]; // doré → Pui
    expect(pui.label).toBe("Rune Pui");
    expect([pui.quantityMin, pui.quantityMax]).toEqual([20, 45]);
  });

  it("maps each muldo to the right signature rune (per the brisage table)", () => {
    expect(brisageFor("4435")[1].label).toBe("Rune Ré Per Air"); // ébène
    expect(brisageFor("4438")[1].label).toBe("Rune Pui"); // doré
    expect(brisageFor("4436")[1].label).toBe("Rune Ré Per Feu"); // orchidée
    expect(brisageFor("4437")[1].label).toBe("Rune Ré Per Terre"); // pourpre
    expect(brisageFor("4434")[1].label).toBe("Rune Ré Per Eau"); // indigo
  });

  it("returns nothing for an unknown or missing mount", () => {
    expect(brisageFor("nope")).toEqual([]);
    expect(brisageFor(undefined)).toEqual([]);
  });
});
