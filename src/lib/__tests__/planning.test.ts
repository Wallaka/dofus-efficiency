import { describe, it, expect } from "vitest";
import { planRotations, formatClock } from "../planning";

describe("formatClock", () => {
  it("formats fractional hours as HH:MM", () => {
    expect(formatClock(8)).toBe("08:00");
    expect(formatClock(18.933)).toBe("18:56");
    expect(formatClock(0.5)).toBe("00:30");
    expect(formatClock(23.999)).toBe("00:00"); // rounds up past midnight
  });
});

describe("planRotations", () => {
  it("chains rotations back-to-back with a 24h window (no idle)", () => {
    const p = planRotations({ availFrom: 0, availTo: 24, rotationHours: 11, horizonDays: 3 });
    expect(p.idleHours).toBe(0);
    // Over 72 h at 11 h each, 6 rotations complete after the first placement → 2/day.
    expect(p.rotationsPerDay).toBeGreaterThanOrEqual(1.9);
    expect(p.rotationsPerDay).toBeLessThanOrEqual(2.2);
  });

  it("keeps every login inside a daytime window", () => {
    const p = planRotations({ availFrom: 8, availTo: 24, rotationHours: 11, horizonDays: 3 });
    for (const e of p.events) {
      expect(e.clock).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(e.clock).toBeLessThan(24);
    }
    expect(p.rotationsPerDay).toBeGreaterThan(1.4);
    expect(p.rotationsPerDay).toBeLessThanOrEqual(2 + 1e-9);
    // First event is a placement at the ideal hour.
    expect(p.events[0].type).toBe("place");
    expect(p.startClock).toBe(p.events[0].clock);
  });

  it("never schedules a login in the night gap", () => {
    const p = planRotations({ availFrom: 9, availTo: 22, rotationHours: 11, horizonDays: 4 });
    for (const e of p.events) {
      expect(e.clock).toBeGreaterThanOrEqual(9 - 1e-9);
      expect(e.clock).toBeLessThan(22);
    }
    // A narrower window still fits ~2/day but wastes some idle waiting overnight.
    expect(p.rotationsPerDay).toBeGreaterThan(1);
    expect(p.idleHours).toBeGreaterThan(0);
  });

  it("treats an inverted window as always-available", () => {
    const p = planRotations({ availFrom: 20, availTo: 6, rotationHours: 11, horizonDays: 2 });
    expect(p.idleHours).toBe(0);
  });
});
