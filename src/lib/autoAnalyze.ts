import type { ScreenshotFile } from "./medalFolder";
import { analyzeImageBlob } from "./analyzeFlow";
import { priceToRecord } from "./priceStore";
import { analyzeScreenshot } from "./screenshotAnalysis";
import { searchItems } from "../data/dofusApi";
import { rankItemMatches } from "./matchItem";
import { screenshotKey, type AnalyzedRecord } from "./analyzedStore";

/**
 * Read one screenshot end-to-end: OCR the whole thing, then look up the best
 * DofusDB item match for the name it read. Nothing is saved here — the reading
 * (and its suggested match) is returned so the UI can show it and let the user
 * Accept it into the price store. This is the per-file unit the batch analyser
 * runs over every un-analysed capture in the folder.
 */

/**
 * Only suggest a pre-filled match confident enough to accept in one click. Below
 * this the reading still shows, but the user picks the item manually.
 */
export const MATCH_SUGGEST_THRESHOLD = 0.5;

export async function processScreenshot(
  file: ScreenshotFile,
): Promise<AnalyzedRecord> {
  const base = { key: screenshotKey(file), name: file.name, analyzedAt: Date.now() };
  try {
    const full = await file.handle.getFile();
    const { analysis, dates } = await analyzeImageBlob(full);
    const recordable = priceToRecord(analysis);

    if (!recordable) {
      return { ...base, status: "no-price", analysis, dates };
    }

    // Suggest an item match from the OCR'd name (best-effort; needs the network).
    let match: AnalyzedRecord["match"] = null;
    if (analysis.itemName) {
      try {
        const items = await searchItems(analysis.itemName);
        const best = rankItemMatches(analysis.itemName, items)[0];
        if (best && best.score >= MATCH_SUGGEST_THRESHOLD) match = best.item;
      } catch {
        // Search unavailable (offline / blocked) — leave match null.
      }
    }

    return { ...base, status: "pending", analysis, dates, match };
  } catch (err) {
    return {
      ...base,
      status: "error",
      analysis: analyzeScreenshot(""),
      dates: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
