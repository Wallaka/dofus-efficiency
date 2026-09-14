import { describe, it, expect } from "vitest";
import { parseFrenchNumber, parseUtterance } from "../voiceParse";

/**
 * Deterministic tests for the voice-entry parsers — no mic/STT involved, so they
 * pin the French-number and grammar logic exactly regardless of recognition
 * variance. The strings here are the kinds of transcripts Web Speech returns.
 */

describe("parseFrenchNumber", () => {
  it("parses plain digits", () => {
    expect(parseFrenchNumber("147")).toBe(147);
    expect(parseFrenchNumber("0")).toBe(0);
  });

  it("parses grouped digits (space/dot thousands)", () => {
    expect(parseFrenchNumber("12 000")).toBe(12000);
    expect(parseFrenchNumber("1.500")).toBe(1500);
  });

  it("parses the k suffix", () => {
    expect(parseFrenchNumber("3k")).toBe(3000);
    expect(parseFrenchNumber("147k")).toBe(147000);
  });

  it("parses French number words", () => {
    expect(parseFrenchNumber("cent quarante-sept")).toBe(147);
    expect(parseFrenchNumber("douze mille")).toBe(12000);
    expect(parseFrenchNumber("mille cinq cents")).toBe(1500);
    expect(parseFrenchNumber("deux cent cinquante")).toBe(250);
  });

  it("handles the soixante/quatre-vingt specials", () => {
    expect(parseFrenchNumber("soixante-dix")).toBe(70);
    expect(parseFrenchNumber("quatre-vingts")).toBe(80);
    expect(parseFrenchNumber("quatre-vingt-dix")).toBe(90);
    expect(parseFrenchNumber("quatre-vingt-quinze")).toBe(95);
    expect(parseFrenchNumber("vingt et un")).toBe(21);
  });

  it("returns null when there is no number", () => {
    expect(parseFrenchNumber("bois de frêne")).toBeNull();
    expect(parseFrenchNumber("")).toBeNull();
  });
});

describe("parseUtterance", () => {
  it("splits a simple name + price", () => {
    expect(parseUtterance("bois de frêne 147")).toEqual({
      name: "bois de frêne",
      price: 147,
    });
  });

  it("strips a comma between name and price", () => {
    expect(parseUtterance("chanvre, 12")).toEqual({ name: "chanvre", price: 12 });
  });

  it("parses a spoken-word price", () => {
    expect(parseUtterance("orchidée douze mille")).toEqual({
      name: "orchidée",
      price: 12000,
    });
  });

  it("reads a lot with 'fois'", () => {
    expect(parseUtterance("ortie fois cent 900")).toEqual({
      name: "ortie",
      price: 900,
      lot: 100,
    });
  });

  it("reads a lot with x-notation", () => {
    expect(parseUtterance("ortie x100 900")).toEqual({
      name: "ortie",
      price: 900,
      lot: 100,
    });
  });

  it("keeps the name when no price is present", () => {
    expect(parseUtterance("frostiz")).toEqual({ name: "frostiz", price: null });
  });

  it("returns null on empty input", () => {
    expect(parseUtterance("   ")).toBeNull();
  });
});
