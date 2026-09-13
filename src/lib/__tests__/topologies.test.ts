import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  analyzeScreenshot,
  mergeAnalyses,
  type ScreenshotAnalysis,
} from "../screenshotAnalysis";

/**
 * Per-topology tests over real OCR captured from the actual game screenshots
 * (fixtures/*.json hold the locate-pass text/words and the crop text). Each test
 * reproduces the real two-pass pipeline deterministically:
 *   merged = mergeAnalyses(analyze(pass1Text), analyze(cropText))
 * We assert the values that OCR reads reliably for each screen type — most
 * importantly that every topology is classified correctly.
 */

const here = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  id: string;
  size: { width: number; height: number };
  pass1Kind: string;
  pass1Text: string;
  cropText: string;
  dates: string[];
}

function load(id: string): Fixture {
  return JSON.parse(readFileSync(join(here, "fixtures", `${id}.json`), "utf8"));
}

function run(id: string): { a: ScreenshotAnalysis; dates: string[] } {
  const f = load(id);
  return { a: mergeAnalyses(analyzeScreenshot(f.pass1Text), analyzeScreenshot(f.cropText)), dates: f.dates };
}

const lot = (a: ScreenshotAnalysis, qty: number) =>
  a.lots.find((l) => l.quantity === qty)?.price ?? null;

describe("topology classification", () => {
  it.each([
    ["market", "market-trend"],
    ["hdv-buy-resource", "hdv"],
    ["hdv-buy-1", "hdv"],
    ["hdv-buy-2", "hdv"],
    ["hdv-buy-3", "hdv"],
    ["hdv-buy-4", "hdv"],
    ["hdv-buy-5", "hdv"],
    ["hdv-sell-1", "hdv-sell"],
    ["hdv-sell-2", "hdv-sell"],
    ["hdv-sell-3", "hdv-sell"],
    ["hdv-sell-4", "hdv-sell"],
    ["hdv-sell-5", "hdv-sell"],
  ])("%s is classified as %s", (id, kind) => {
    expect(run(id).a.kind).toBe(kind);
  });
});

describe("HDV category (from the title icon's filter/footer text)", () => {
  it.each([
    ["market", "resource"],
    ["hdv-buy-resource", "resource"],
    ["hdv-buy-1", "resource"],
    ["hdv-buy-5", "resource"],
    ["hdv-sell-1", "rune"],
    ["hdv-sell-3", "rune"],
    ["hdv-sell-4", "rune"],
    ["hdv-sell-5", "rune"],
    ["hdvtype-equip", "equipment"],
    ["hdvtype-rune", "rune"],
    ["hdvtype-resource", "resource"],
  ])("%s → %s", (id, category) => {
    expect(run(id).a.category).toBe(category);
  });
});

describe("Cours du marché (market)", () => {
  const { a, dates } = run("market");
  it("reads the focused resource name (not an inventory item)", () => {
    expect(a.itemName).toContain("Bois de Frêne");
  });
  it("reads médian and moyen prices", () => {
    expect(a.averagePrice).toBe(104);
    expect(a.medianPrice).toBe(99);
  });
  it("reads the 7-day date axis", () => {
    expect(dates.length).toBeGreaterThanOrEqual(7);
  });
});

describe("Achat matériaux (HDV buy, resource)", () => {
  const { a } = run("hdv-buy-resource");
  it("names the resource and its category", () => {
    expect(a.itemName).toBe("Bois de Frêne");
    expect(a.category).toBe("resource");
  });
  it("reads prix moyen", () => {
    expect(a.averagePrice).toBe(113);
  });
  it("reads all four lot prices", () => {
    expect(lot(a, 1)).toBe(93);
    expect(lot(a, 10)).toBe(963);
    expect(lot(a, 100)).toBe(9780);
    expect(lot(a, 1000)).toBe(119000);
  });
});

describe("Achat matériaux (HDV buy, item detail popup)", () => {
  it("names the item (multi-word, non-resource types)", () => {
    expect(run("hdv-buy-1").a.itemName).toBe("Fragment de carte de Frakacia");
    expect(run("hdv-buy-4").a.itemName).toBe("Carte de Frakacia");
    expect(run("hdv-buy-5").a.itemName).toBe("Culotte de Frakacia");
  });

  it("reads prix moyen from the detail popup, not the listing/categories", () => {
    expect(run("hdv-buy-1").a.averagePrice).toBe(20143);
    expect(run("hdv-buy-2").a.averagePrice).toBe(1419);
    expect(run("hdv-buy-3").a.averagePrice).toBe(3270);
    expect(run("hdv-buy-4").a.averagePrice).toBe(123871);
    expect(run("hdv-buy-5").a.averagePrice).toBe(9280);
  });

  it("reads the buy lot table", () => {
    const b1 = run("hdv-buy-1").a;
    expect(lot(b1, 1)).toBe(16397);
    expect(lot(b1, 10)).toBe(139999);
    const b2 = run("hdv-buy-2").a;
    expect(lot(b2, 1)).toBe(1327);
    expect(lot(b2, 10)).toBe(18993);
  });
});

describe("Vente matériaux (HDV sell)", () => {
  it("reads the item name (rune, no type word)", () => {
    expect(run("hdv-sell-1").a.itemName).toBe("Rune Do Air");
    expect(run("hdv-sell-3").a.itemName).toBe("Rune Pa Do Pou");
    expect(run("hdv-sell-4").a.itemName).toBe("Rune Pui");
    expect(run("hdv-sell-5").a.itemName).toBe("Rune Ré Feu");
  });

  it("reads prix moyen where legible", () => {
    expect(run("hdv-sell-2").a.averagePrice).toBe(1216);
    expect(run("hdv-sell-4").a.averagePrice).toBe(231);
    expect(run("hdv-sell-5").a.averagePrice).toBe(244);
  });

  it("reads the Actuellement en vente lot table", () => {
    const s1 = run("hdv-sell-1").a;
    expect(lot(s1, 1)).toBe(1328);
    expect(lot(s1, 10)).toBe(13748);
    expect(lot(s1, 100)).toBe(137967);
    expect(lot(s1, 1000)).toBe(1379637);

    const s4 = run("hdv-sell-4").a;
    expect(lot(s4, 10)).toBe(2600);
    expect(lot(s4, 100)).toBe(26590);
  });

  it("never reads Prix moyen / Prix du lot as a lot row", () => {
    // 1317 (sell-1 prix moyen) and 14653 (prix du lot) must not appear as lots.
    for (const id of ["hdv-sell-1", "hdv-sell-2", "hdv-sell-3", "hdv-sell-4", "hdv-sell-5"]) {
      const a = run(id).a;
      const prices = a.lots.map((l) => l.price);
      expect(prices).not.toContain(14653);
    }
  });
});
