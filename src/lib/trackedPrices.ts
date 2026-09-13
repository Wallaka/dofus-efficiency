import type { Item } from "../types";
import { loadPrices, savePrices } from "./storage";
import {
  recordPriceEntry,
  deletePriceEntry,
  type PriceEntry,
} from "./priceStore";

/**
 * The manual price path (as opposed to OCR). Both write to the same two stores:
 * the plain PriceMap the craft/éleveur maths read, and the dated PriceEntry the
 * Prix/Suivis pages show. This keeps them in sync from anywhere that isn't the
 * Craft page's in-memory editor.
 */

/**
 * Set an item's price by hand: updates the number the calc reads and stamps a
 * "manuel" entry dated now, so it appears dated on the Prix and Suivis pages.
 * Returns the entry written.
 */
export function setManualPrice(item: Item, price: number): PriceEntry {
  const prices = loadPrices() ?? {};
  prices[item.id] = price;
  savePrices(prices);

  const entry: PriceEntry = {
    itemId: item.id,
    name: item.name,
    level: item.level,
    img: item.img,
    price,
    updatedAt: Date.now(),
    source: "manual",
  };
  recordPriceEntry(entry);
  return entry;
}

/** Forget an item's price entirely — both the number and its dated entry. */
export function clearPrice(itemId: string): void {
  const prices = loadPrices();
  if (prices && itemId in prices) {
    delete prices[itemId];
    savePrices(prices);
  }
  deletePriceEntry(itemId);
}
