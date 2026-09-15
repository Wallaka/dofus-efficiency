import { describe, it, expect } from "vitest";
import { MULDOS, MOUNTS, mountById } from "../mounts";

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
