/**
 * The screenshot OCR pipeline, shared by the manual detail view and the
 * automatic batch analyser. Keeping it in one place means both paths classify,
 * auto-crop and read prices identically.
 *
 * The default flow is the two-pass auto-crop: pass 1 reads the whole image (with
 * word boxes) to classify the screen and locate the price panel; pass 2 re-reads
 * just that (upscaled) panel for accurate figures.
 */
import { recognizeImage } from "./ocr";
import {
  analyzeScreenshot,
  mergeAnalyses,
  type ScreenshotAnalysis,
} from "./screenshotAnalysis";
import { cropImageToBlob, type CropRect } from "./cropImage";
import { computeAutoCrop } from "./autoCrop";
import { extractMarketDates } from "./chartExtract";

export interface FlowResult {
  analysis: ScreenshotAnalysis;
  /** Market-graph x-axis dates, when the screen is a price history. */
  dates: string[];
  /** The auto-crop rectangle chosen (for display), or null if none. */
  autoRect: CropRect | null;
}

/** Natural pixel size of an image blob. */
async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    return { width: bmp.width, height: bmp.height };
  } finally {
    bmp.close?.();
  }
}

/** Crop, falling back to the whole image if the rect is bad/tiny. */
export async function cropSafe(full: Blob, rect: CropRect): Promise<Blob> {
  try {
    return await cropImageToBlob(full, rect);
  } catch {
    return full;
  }
}

/**
 * Analyse a full-image blob with the two-pass auto-crop flow. `onProgress` runs
 * 0→1 across both passes.
 */
export async function analyzeImageBlob(
  full: Blob,
  onProgress?: (fraction: number) => void,
): Promise<FlowResult> {
  const pass1 = await recognizeImage(full, {
    boxes: true,
    onProgress: (p) => onProgress?.(p * 0.5),
  });
  const a1 = analyzeScreenshot(pass1.text);
  const isMarket = a1.kind === "market-trend";

  const rect = computeAutoCrop(
    pass1.words,
    await imageSize(full),
    a1.kind,
    a1.category,
  );
  if (!rect) {
    onProgress?.(1);
    return { analysis: a1, dates: [], autoRect: null }; // couldn't localise
  }

  const cropBlob = await cropSafe(full, rect);
  const pass2 = await recognizeImage(cropBlob, {
    boxes: isMarket,
    onProgress: (p) => onProgress?.(0.5 + p * 0.5),
  });
  const a2 = analyzeScreenshot(pass2.text);
  const dates = isMarket ? extractMarketDates(pass2.words) : [];
  return { analysis: mergeAnalyses(a1, a2), dates, autoRect: rect };
}
