import type { ScreenshotFile } from "./medalFolder";
import type { Item } from "../types";
import { analyzeImageBlob } from "./analyzeFlow";
import { priceToRecord } from "./priceStore";
import { searchItems } from "../data/dofusApi";
import { rankItemMatches } from "./matchItem";
import { screenshotKey, type AnalyzedRecord } from "./analyzedStore";

/**
 * Analyse one screenshot end-to-end and, when confident, save its price — the
 * per-file unit the automatic batch analyser runs over each un-analysed capture.
 *
 * The risky step is matching the OCR'd name to a real DofusDB item: a wrong
 * match would poison the price DB. So we only save automatically when the best
 * name match clears AUTO_MATCH_THRESHOLD; otherwise we record the price as
 * "unmatched" for the user to confirm in one click (no re-OCR needed).
 */

/** Minimum name-match confidence (0–1) to auto-save without confirmation. */
export const AUTO_MATCH_THRESHOLD = 0.58;

export type ApplyPrice = (item: Item, price: number, detail: string) => void;

export async function processScreenshot(
  file: ScreenshotFile,
  onApplyPrice?: ApplyPrice,
): Promise<AnalyzedRecord> {
  const base = { key: screenshotKey(file), name: file.name, analyzedAt: Date.now() };
  try {
    const full = await file.handle.getFile();
    const { analysis } = await analyzeImageBlob(full);
    const recordable = priceToRecord(analysis);

    if (!recordable) {
      return {
        ...base,
        status: "no-price",
        kind: analysis.kind,
        itemName: analysis.itemName,
        price: null,
        detail: null,
      };
    }

    // Confident match → save; else keep the price for a one-click confirm.
    if (analysis.itemName && onApplyPrice) {
      try {
        const items = await searchItems(analysis.itemName);
        const best = rankItemMatches(analysis.itemName, items)[0];
        if (best && best.score >= AUTO_MATCH_THRESHOLD) {
          onApplyPrice(best.item, recordable.price, recordable.detail);
          return {
            ...base,
            status: "saved",
            kind: analysis.kind,
            itemName: analysis.itemName,
            price: recordable.price,
            detail: recordable.detail,
            savedItemId: best.item.id,
            savedItemName: best.item.name,
          };
        }
      } catch {
        // Search unavailable (offline / blocked) — fall through to "unmatched".
      }
    }

    return {
      ...base,
      status: "unmatched",
      kind: analysis.kind,
      itemName: analysis.itemName,
      price: recordable.price,
      detail: recordable.detail,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      kind: "unknown",
      itemName: null,
      price: null,
      detail: null,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
