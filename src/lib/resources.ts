import type { Item } from "../types";

/**
 * "Mes ressources": what the player already has in stock. Optionally deducted
 * from craft ingredient costs (the "Utiliser mes ressources" toggle), so the
 * cost shown is what's left to buy.
 */
export interface ResourceStock {
  item: Item;
  quantity: number;
}
export type ResourceMap = Record<string, ResourceStock>;

const KEY = "dofus-efficiency:resources:v1";
const USE_KEY = "dofus-efficiency:useMaterials:v1";

function isItem(x: unknown): x is Item {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as Item).id === "string" &&
    typeof (x as Item).name === "string"
  );
}

export function loadResources(): ResourceMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ResourceMap = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const s = v as ResourceStock;
      if (isItem(s?.item) && typeof s.quantity === "number" && s.quantity > 0) {
        out[id] = { item: s.item, quantity: Math.floor(s.quantity) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveResources(map: ResourceMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

/** Item id → quantity in stock (only positive amounts), for the craft maths. */
export function stockQuantities(map: ResourceMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, r] of Object.entries(map)) {
    if (r.quantity > 0) out[id] = r.quantity;
  }
  return out;
}

/** Whether the craft pages deduct owned stock from costs (shared toggle). */
export function loadUseMaterials(): boolean {
  try {
    return localStorage.getItem(USE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveUseMaterials(on: boolean): void {
  try {
    localStorage.setItem(USE_KEY, on ? "1" : "0");
  } catch {
    // non-fatal
  }
}
