import type { Item, PriceMap } from "../types";

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
  /** Resource rewards. */
  rewards: QuestReward[];
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

export function newQuestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
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
