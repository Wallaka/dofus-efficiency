import type { Item, PriceMap } from "../types";
import { QUESTS_CATALOG } from "./questsCatalog";

/**
 * The daily/weekly quest "routine": a small user-curated list of repeatable
 * quests, each rewarding raw kamas and/or resources. The point is to see how
 * profitable each one is (kamas + the market value of its resource rewards, using
 * the shared price store) so you can decide which to run each day/week.
 *
 * Persisted in localStorage like the other lite stores (favourites, éleveur).
 */

const KEY = "dofus-efficiency:quests:v1";

export type QuestPeriod = "daily" | "weekly";

/** One resource reward line: a resource and how many the quest gives. */
export interface QuestReward {
  /** Cached item (id/name/img/level) so the row renders without a dataset. */
  item: Item;
  quantity: number;
}

export interface Quest {
  id: string;
  name: string;
  period: QuestPeriod;
  /** Link to the related dofuspourlesnoobs page, optional. */
  url?: string;
  /** Raw kamas reward. */
  kamas: number;
  /** Resource rewards (priced from the store). */
  rewards: QuestReward[];
  /** Zone the quest belongs to (from the catalog), optional. */
  zone?: string;
  /** Free-text reward description ("annexe") shown as-is (e.g. parchemins). */
  note?: string;
  /**
   * Quests sharing a variantGroup can only be done once per day (alignment or
   * profession choice), so routine totals count just the best of the group.
   */
  variantGroup?: string;
}

/** Total reward value of a quest: raw kamas + resource rewards at known prices. */
export interface QuestValue {
  /** Sum of kamas + priced resource rewards. */
  total: number;
  /** Value of the resource rewards alone (priced ones). */
  resourcesValue: number;
  /** Reward lines whose resource has no known price yet. */
  missing: QuestReward[];
}

export function questValue(quest: Quest, prices: PriceMap): QuestValue {
  let resourcesValue = 0;
  const missing: QuestReward[] = [];
  for (const r of quest.rewards) {
    const unit = prices[r.item.id];
    if (unit == null) missing.push(r);
    else resourcesValue += unit * r.quantity;
  }
  return { total: quest.kamas + resourcesValue, resourcesValue, missing };
}

/**
 * Total value of a set of quests, respecting variant groups: quests that share a
 * variantGroup can only be done once (per day), so only the best one counts.
 * Non-grouped quests all count.
 */
export function periodTotal(quests: Quest[], prices: PriceMap): number {
  let total = 0;
  const bestByGroup = new Map<string, number>();
  for (const q of quests) {
    const v = questValue(q, prices).total;
    if (q.variantGroup) {
      bestByGroup.set(q.variantGroup, Math.max(bestByGroup.get(q.variantGroup) ?? 0, v));
    } else {
      total += v;
    }
  }
  for (const v of bestByGroup.values()) total += v;
  return total;
}

export function newQuestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Identity for dedupe when importing: the quest's URL, else name + period. */
function questKey(q: { url?: string; name: string; period: QuestPeriod }): string {
  return q.url ? `url:${q.url}` : `np:${q.name}::${q.period}`;
}

/**
 * Merge the bundled catalog into an existing list, skipping quests already present
 * (by URL, else name+period). Returns the new list and how many were added.
 */
export function importCatalog(existing: Quest[]): { quests: Quest[]; added: number } {
  const seen = new Set(existing.map(questKey));
  const added: Quest[] = [];
  for (const seed of QUESTS_CATALOG) {
    const key = questKey(seed);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({
      id: newQuestId(),
      name: seed.name,
      period: seed.period,
      url: seed.url,
      kamas: seed.kamas,
      rewards: [],
      zone: seed.zone,
      note: seed.variable ? `${seed.note ?? ""} (variable)`.trim() : seed.note,
      variantGroup: seed.variantGroup,
    });
  }
  return { quests: [...existing, ...added], added: added.length };
}

export function loadQuests(): Quest[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed entries (defend against older/partial data).
    return parsed.filter(
      (q): q is Quest =>
        q &&
        typeof q.id === "string" &&
        typeof q.name === "string" &&
        (q.period === "daily" || q.period === "weekly") &&
        Array.isArray(q.rewards),
    );
  } catch {
    return [];
  }
}

export function saveQuests(quests: Quest[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(quests));
  } catch {
    // non-fatal (quota / private mode)
  }
}
