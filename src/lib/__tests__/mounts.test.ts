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
  it("gives every muldo 1 Rune Ga Pme plus its signature rune", () => {
    for (const m of MULDOS) {
      const runes = brisageFor(m.id);
      expect(runes.length).toBe(2);
      expect(runes[0].label).toBe("Rune Ga Pme");
      expect(runes[0].quantity).toBe(1);
    }
  });

  it("maps each muldo to the right signature rune (per the brisage table)", () => {
    expect(brisageFor("4435")[1].label).toBe("Rune Ré Per Air"); // ébène → 13 air
    expect(brisageFor("4435")[1].quantity).toBe(13);
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
