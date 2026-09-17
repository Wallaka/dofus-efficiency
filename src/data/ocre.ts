/**
 * Dofus Ocre — the "Chasse aux archimonstres" model.
 *
 * To earn the Dofus Ocre you must capture the soul of every archimonster once.
 * For each one there are two ways to get its soul, each with a real kama cost:
 *
 *   - Acheter  — buy the captured "Âme de …" soul at the HDV (the archimonster's
 *                tradeable soul item; priced through the normal price store).
 *   - Capturer — consume an empty "pierre d'âme spéciale" to capture it yourself;
 *                the cost is that stone's HDV price (stone-price only — we don't
 *                model the time to find and kill the archimonster).
 *
 * The stone you need is the smallest tier whose capacity covers the
 * archimonster's level. The five capture stones already live in the HDV catalog
 * (item ids below), so they price through the same store as everything else.
 */

export type StoneTier = "petite" | "moyenne" | "grande" | "enorme" | "gigantesque";

export interface SoulStone {
  tier: StoneTier;
  /** DofusDB item id (already present in the bundled catalog). */
  itemId: string;
  name: string;
  /** Highest archimonster level this stone can capture. */
  maxLevel: number;
}

/**
 * The five "spéciale" capture stones, smallest first. Level caps are the in-game
 * capacities (petite 50 · moyenne 100 · grande 150 · énorme 190 · gigantesque:
 * everything above — no practical ceiling).
 */
export const SOUL_STONES: SoulStone[] = [
  { tier: "petite", itemId: "31444", name: "Petite pierre d'âme spéciale", maxLevel: 50 },
  { tier: "moyenne", itemId: "31445", name: "Moyenne pierre d'âme spéciale", maxLevel: 100 },
  { tier: "grande", itemId: "31446", name: "Grande pierre d'âme spéciale", maxLevel: 150 },
  { tier: "enorme", itemId: "31447", name: "Énorme pierre d'âme spéciale", maxLevel: 190 },
  { tier: "gigantesque", itemId: "31448", name: "Gigantesque pierre d'âme spéciale", maxLevel: 1000 },
];

/** The smallest stone whose capacity covers `level` (falls back to the biggest). */
export function stoneForLevel(level: number): SoulStone {
  return (
    SOUL_STONES.find((s) => level <= s.maxLevel) ?? SOUL_STONES[SOUL_STONES.length - 1]
  );
}

/** One archimonster in the hunt, as baked into `archimonsters.generated.ts`. */
export interface Archimonster {
  /** DofusDB monster id (the capture-tracking key). */
  monsterId: number;
  name: string;
  level: number;
  /** Monster picture. */
  img?: string;
  /** The tradeable "Âme de …" soul item id, for the "acheter" price. */
  soulItemId?: string;
  soulName?: string;
  soulImg?: string;
}
