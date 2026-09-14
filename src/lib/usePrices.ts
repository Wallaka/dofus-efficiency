import { useCallback, useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";
import type { Lot } from "./screenshotAnalysis";
import {
  loadPriceEntries,
  recordPriceEntry,
  deletePriceEntry,
  pricesFromEntries,
  type PriceEntry,
  type PriceEntryMap,
  type PriceSource,
} from "./priceStore";

export interface UsePrices {
  /** Dated price entries — the single source of truth. */
  entries: PriceEntryMap;
  /** The plain price map the maths read, derived from `entries`. */
  prices: PriceMap;
  /** Set an item's price (stamps a dated entry). Returns the entry written. */
  setPrice: (
    item: Item,
    price: number,
    source?: PriceSource,
    detail?: string,
    lots?: Lot[],
  ) => PriceEntry;
  /** Forget an item's price. */
  clearPrice: (itemId: string) => void;
}

/**
 * The single React accessor for prices. Holds the dated entries in state and
 * derives the number map from them, so a component never keeps a second copy
 * that could drift. Writes go to the shared store and update the state.
 */
export function usePrices(): UsePrices {
  const [entries, setEntries] = useState<PriceEntryMap>(loadPriceEntries);
  const prices = useMemo(() => pricesFromEntries(entries), [entries]);

  const setPrice = useCallback(
    (
      item: Item,
      price: number,
      source: PriceSource = "manual",
      detail?: string,
      lots?: Lot[],
    ) => {
      const entry: PriceEntry = {
        itemId: item.id,
        name: item.name,
        level: item.level,
        img: item.img,
        price,
        updatedAt: Date.now(),
        source,
        detail,
        lots,
      };
      recordPriceEntry(entry);
      setEntries((prev) => ({ ...prev, [item.id]: entry }));
      return entry;
    },
    [],
  );

  const clearPrice = useCallback((itemId: string) => {
    deletePriceEntry(itemId);
    setEntries((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  return { entries, prices, setPrice, clearPrice };
}
