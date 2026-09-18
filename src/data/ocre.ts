import type { PriceMap } from "../types";

/**
 * Dofus Ocre — the "Chasse aux archimonstres" model.
 *
 * To earn the Dofus Ocre you must capture the soul of every archimonster once.
 * For each one there are two ways to get its soul, each with a real kama cost:
 *
 *   - Acheter  — buy the captured "Âme de …" soul at the HDV (the archimonster's
 *                tradeable soul item; priced through the normal price store).
 *   - Capturer — consume an empty "pierre d'âme" to capture it yourself; the cost
 *                is that stone's HDV price (stone-price only — we don't model the
 *                time to find and kill the archimonster).
 *
 * The stone you need is the smallest tier whose capacity covers the
 * archimonster's level. The five stones are ordinary priced items, so they read
 * from the same price store as everything else (set them on Craft / Prix).
 */

export type StoneTier = "petite" | "moyenne" | "grande" | "enorme" | "gigantesque";

export interface SoulStone {
  tier: StoneTier;
  /** DofusDB item id — the regular "Pierre d'âme" tiers used to capture. */
  itemId: string;
  name: string;
  /** Highest archimonster level this stone can capture. */
  maxLevel: number;
}

/**
 * The five capture stones, smallest first. Level caps are the in-game
 * capacities (petite 50 · moyenne 100 · grande 150 · énorme 190 · gigantesque:
 * everything above — no practical ceiling).
 */
export const SOUL_STONES: SoulStone[] = [
  { tier: "petite", itemId: "9686", name: "Petite pierre d'âme", maxLevel: 50 },
  { tier: "moyenne", itemId: "9687", name: "Moyenne pierre d'âme", maxLevel: 100 },
  { tier: "grande", itemId: "9688", name: "Grande pierre d'âme", maxLevel: 150 },
  { tier: "enorme", itemId: "9689", name: "Énorme pierre d'âme", maxLevel: 190 },
  { tier: "gigantesque", itemId: "9690", name: "Gigantesque pierre d'âme", maxLevel: 1000 },
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

/** How to obtain a soul, cheapest first: buy it, or capture it with a stone. */
export type OcrePath = "buy" | "capture";

/** One archimonster resolved against the current prices and capture state. */
export interface OcreRow {
  archi: Archimonster;
  captured: boolean;
  /** The stone required to capture it (smallest tier covering its level). */
  stone: SoulStone;
  /** HDV price of the "Âme de …" soul (buy), if known. */
  buyPrice?: number;
  /** HDV price of the required capture stone, if known. */
  stonePrice?: number;
  /**
   * Profit from capturing then reselling the soul: buy − stone. Positive means
   * the soul sells for more than the stone costs (worth farming). Undefined
   * when either price is unknown.
   */
  benefit?: number;
  /** Cheaper way to obtain this soul for the collection, when a price is known. */
  bestPath?: OcrePath;
  /** Cost of `bestPath` — the cheapest way to obtain this one soul. */
  bestCost?: number;
}

/** Resolve one archimonster against prices + capture state (pure). */
export function ocreRow(
  archi: Archimonster,
  captured: boolean,
  prices: PriceMap,
): OcreRow {
  const stone = stoneForLevel(archi.level);
  const buyPrice = archi.soulItemId ? prices[archi.soulItemId] : undefined;
  const stonePrice = prices[stone.itemId];
  const benefit =
    buyPrice != null && stonePrice != null ? buyPrice - stonePrice : undefined;

  let bestPath: OcrePath | undefined;
  let bestCost: number | undefined;
  if (buyPrice != null) {
    bestPath = "buy";
    bestCost = buyPrice;
  }
  // Capture wins ties are broken toward buying (buy set first); capture only
  // takes over when it is strictly cheaper, or when no buy price is known.
  if (stonePrice != null && (bestCost == null || stonePrice < bestCost)) {
    bestPath = "capture";
    bestCost = stonePrice;
  }

  return { archi, captured, stone, buyPrice, stonePrice, benefit, bestPath, bestCost };
}

/** Headline numbers for the top-of-page tiles. */
export interface OcreSummary {
  total: number;
  capturedCount: number;
  missingCount: number;
  /** Captured / total, 0..1 (0 when there are no archimonsters yet). */
  progress: number;
  /** Σ of every known soul price — buy the whole collection at the HDV. */
  packHdv: number;
  /** Archimonsters with no known soul price (excluded from `packHdv`). */
  packHdvUnpriced: number;
  /** Σ of every required stone price — capture the whole collection. */
  packCaptured: number;
  /** Archimonsters whose stone has no known price (excluded from `packCaptured`). */
  packCapturedUnpriced: number;
  /** Σ of the cheapest path over the *missing* archimonsters. */
  costToComplete: number;
  /** Missing archimonsters with no usable price (excluded from `costToComplete`). */
  completeUnpriced: number;
  /** Saved vs buying every missing soul at the HDV (over comparable rows). */
  saving: number;
}

/** Aggregate a set of resolved rows into the headline summary (pure). */
export function ocreSummary(rows: OcreRow[]): OcreSummary {
  let capturedCount = 0;
  let packHdv = 0;
  let packHdvUnpriced = 0;
  let packCaptured = 0;
  let packCapturedUnpriced = 0;
  let costToComplete = 0;
  let completeUnpriced = 0;
  let saving = 0;

  for (const r of rows) {
    if (r.captured) capturedCount++;

    if (r.buyPrice != null) packHdv += r.buyPrice;
    else packHdvUnpriced++;

    if (r.stonePrice != null) packCaptured += r.stonePrice;
    else packCapturedUnpriced++;

    if (!r.captured) {
      if (r.bestCost != null) costToComplete += r.bestCost;
      else completeUnpriced++;
      // Saving is only meaningful where the soul has a buy price to beat.
      if (r.buyPrice != null && r.bestCost != null) {
        saving += r.buyPrice - r.bestCost;
      }
    }
  }

  const total = rows.length;
  return {
    total,
    capturedCount,
    missingCount: total - capturedCount,
    progress: total > 0 ? capturedCount / total : 0,
    packHdv,
    packHdvUnpriced,
    packCaptured,
    packCapturedUnpriced,
    costToComplete,
    completeUnpriced,
    saving,
  };
}

/* ---- Metamob import: update capture progress from a Metamob JSON export ---- */

/** Accent/case-insensitive name key, to match Metamob names to our archimonsters. */
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** One monster line from a Metamob "ocre" quest. `owned` = captured (quantity > 0). */
export interface MetamobMonster {
  name: string;
  owned: boolean;
}

/** An "ocre" quest from a Metamob export — one per character. */
export interface MetamobQuest {
  character: string;
  server: string;
  monsters: MetamobMonster[];
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}

/**
 * Pull the Ocre quest(s) out of a parsed Metamob export (untrusted input).
 * Returns one MetamobQuest per character that tracks the "ocre" hunt.
 */
export function parseMetamob(data: unknown): MetamobQuest[] {
  const quests = asRecord(data).quests;
  if (!Array.isArray(quests)) return [];
  const out: MetamobQuest[] = [];
  for (const raw of quests) {
    const q = asRecord(raw);
    if (asRecord(q.quest_type).slug !== "ocre") continue;
    const monstersRaw = Array.isArray(q.monsters) ? q.monsters : [];
    const monsters: MetamobMonster[] = [];
    for (const m of monstersRaw) {
      const mm = asRecord(m);
      const name = String(asRecord(mm.name).fr ?? mm.name ?? "").trim();
      if (!name) continue;
      monsters.push({ name, owned: Number(mm.quantity) > 0 });
    }
    out.push({
      character: String(q.character_name ?? "?"),
      server: String(q.server ?? ""),
      monsters,
    });
  }
  return out;
}

/** Outcome of matching a Metamob quest against our archimonster list. */
export interface MetamobResult {
  /** monsterId → captured, for every monster we could match by name. */
  updates: Record<string, boolean>;
  matched: number;
  owned: number;
  /** Metamob monsters we couldn't match to an archimonster. */
  unknown: number;
}

/**
 * Turn a Metamob quest into capture updates keyed by our monster id — matched by
 * normalized name. Only capture state is produced; prices are never touched.
 */
export function metamobUpdates(
  quest: MetamobQuest,
  archimonsters: Archimonster[],
): MetamobResult {
  const byName = new Map<string, string>();
  for (const a of archimonsters) {
    const k = normName(a.name);
    if (!byName.has(k)) byName.set(k, String(a.monsterId));
  }
  const updates: Record<string, boolean> = {};
  let matched = 0;
  let owned = 0;
  let unknown = 0;
  for (const m of quest.monsters) {
    const id = byName.get(normName(m.name));
    if (!id) {
      unknown++;
      continue;
    }
    matched++;
    if (m.owned) owned++;
    updates[id] = m.owned;
  }
  return { updates, matched, owned, unknown };
}
