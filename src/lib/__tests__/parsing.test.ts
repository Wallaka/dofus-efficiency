import { describe, it, expect } from "vitest";
import {
  analyzeScreenshot,
  parseLots,
  parseSellLots,
  parseAveragePrice,
  parseMedianPrice,
  parseArticlesSold,
} from "../screenshotAnalysis";

/**
 * Deterministic unit tests for the OCR-text parsers — no browser/OCR involved, so
 * they pin the parsing logic exactly regardless of OCR variance.
 */

describe("parseLots (HDV buy table)", () => {
  it("reads x1/x10/x100/x1000 with the double-space column gap", () => {
    const text = "Lot  Prix\n1  93\n10  963\n100  9 780\n1 000  119 000";
    expect(parseLots(text)).toEqual([
      { quantity: 1, price: 93, unitPrice: 93 },
      { quantity: 10, price: 963, unitPrice: 96.3 },
      { quantity: 100, price: 9780, unitPrice: 97.8 },
      { quantity: 1000, price: 119000, unitPrice: 119 },
    ]);
  });

  it("accepts a leading icon glyph before the quantity", () => {
    const text = "* 1  93\n$ 10  963";
    expect(parseLots(text).map((l) => [l.quantity, l.price])).toEqual([
      [1, 93],
      [10, 963],
    ]);
  });

  it("ignores item-list rows that start with a name", () => {
    expect(parseLots("Bois de Frene  1 113")).toEqual([]);
  });
});

describe("parseSellLots (Actuellement en vente)", () => {
  it("reads only the table after the header and drops a unit-price outlier", () => {
    const text = [
      "Prix du lot",
      "14653",
      "PRIX MOYEN",
      "1 317", // must NOT be read as a lot
      "ACTUELLEMENT EN VENTE",
      "Lot Prix",
      "{ PAR 1 328", // x1 icon ate the qty → outlier, dropped
      "# 10 13 748",
      "# 100 137 967",
      "Ae 1000 1379637",
    ].join("\n");
    expect(parseSellLots(text).map((l) => [l.quantity, l.price])).toEqual([
      [10, 13748],
      [100, 137967],
      [1000, 1379637],
    ]);
  });

  it("keeps a clean 4-row table intact", () => {
    const text = "ACTUELLEMENT EN VENTE\nLot Prix\n1 1 328\n10 13 748\n100 137 967\n1000 1 379 637";
    expect(parseSellLots(text).map((l) => [l.quantity, l.price])).toEqual([
      [1, 1328],
      [10, 13748],
      [100, 137967],
      [1000, 1379637],
    ]);
  });
});

describe("parseAveragePrice / parseMedianPrice", () => {
  it("reads the value on the same line", () => {
    expect(parseAveragePrice("Prix moyen : 104")).toBe(104);
    expect(parseMedianPrice("Prix médian : 99")).toBe(99);
  });
  it("reads the value on the next line", () => {
    expect(parseAveragePrice("PRIX MOYEN\n1 317")).toBe(1317);
  });
  it("skips a single-digit icon glyph next to the label", () => {
    expect(parseAveragePrice("PRIX MOYEN 7\n1 216")).toBe(1216);
    expect(parseAveragePrice("PRIX MOYEN 4 Rune Pui\n244")).toBe(244);
  });
  it("returns null when no value is near the label", () => {
    expect(parseAveragePrice("PRIX MOYEN\nTETE\nACTUELLEMENT")).toBeNull();
  });
  it("does not bridge the double-space gap after the market value", () => {
    expect(parseAveragePrice("Prix moyen : 104  1 387 925 articles vendus")).toBe(104);
  });
});

describe("parseArticlesSold", () => {
  it("reads the sold count", () => {
    expect(parseArticlesSold("1 387 925 articles vendus")).toBe(1387925);
  });
});

describe("item name extraction", () => {
  it("reads a name above a Niveau·Type line", () => {
    const a = analyzeScreenshot("Bois de Frêne\nNiveau 1 · Bois\nPrix moyen : 113");
    expect(a.itemName).toBe("Bois de Frêne");
    expect(a.level).toBe(1);
  });
  it("reads a rune name with a bare NIV. line and no type word", () => {
    const a = analyzeScreenshot("Rune Pui\nNIV. 15\nPrix du lot");
    expect(a.itemName).toBe("Rune Pui");
  });
  it("stops the name at UI chrome bleeding onto the row", () => {
    const a = analyzeScreenshot("Rune Ré Feu Q Rechercher dans la\nNIV. 30");
    expect(a.itemName).toBe("Rune Ré Feu");
  });
  it("strips leading junk and stray one-letter speckle", () => {
    const a = analyzeScreenshot("3, 3 4 5, Bois de Frêne CL\nNiveau 1 · Bois");
    expect(a.itemName).toBe("Bois de Frêne CL");
  });
});
