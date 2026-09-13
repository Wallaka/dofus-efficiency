import type { ScreenshotFile } from "./medalFolder";
import { analyzeImageBlob } from "./analyzeFlow";
import { priceToRecord } from "./priceStore";
import { analyzeScreenshot } from "./screenshotAnalysis";
import { searchItems } from "../data/dofusApi";
import { rankItemMatches } from "./matchItem";
import { screenshotKey, type AnalyzedRecord } from "./analyzedStore";

/**
 * Read one screenshot end-to-end: OCR the whole thing, then look up DofusDB
 * matches for the name it read. Nothing is saved here — the reading (and its
 * ranked candidate items) is returned so the UI can show it and let the user
 * Accept it into the price store in one click, no typing. This is the per-file
 * unit the batch analyser runs over every un-analysed capture in the folder.
 */

/** How many ranked candidate items to keep for the accept step. */
const MAX_CANDIDATES = 5;

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

    // Search the OCR'd name and keep the ranked candidates (best-effort; needs
    // the network). The accept step shows these so the user never has to type.
    let candidates: AnalyzedRecord["candidates"];
    if (analysis.itemName) {
      try {
        const items = await searchItems(analysis.itemName);
        candidates = rankItemMatches(analysis.itemName, items)
          .slice(0, MAX_CANDIDATES)
          .map((m) => m.item);
      } catch {
        // Search unavailable (offline / blocked) — leave candidates undefined.
      }
    }

    return { ...base, status: "pending", analysis, dates, candidates };
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
