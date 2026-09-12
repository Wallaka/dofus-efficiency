/**
 * OCR for screenshots, via Tesseract.js.
 *
 * Dofus' UI is French, so we recognize with the `fra` model. Tesseract's worker,
 * wasm core and language data are fetched from a CDN on first use (a few MB, then
 * cached by the browser). That's fine for the deployed app; if we later want it
 * fully offline (see the manifesto), self-host those assets and set the paths in
 * `createWorker`'s options — this module is the single place to change.
 *
 * The heavy library is imported dynamically so it doesn't weigh down initial load;
 * it's only pulled in the first time a screenshot is analysed.
 */

/** Anything Tesseract accepts as an image (a File/Blob works). */
export type OcrImage = Blob;

export interface OcrResult {
  /** Full recognized text. */
  text: string;
  /** `text` split into non-empty trimmed lines. */
  lines: string[];
  /** Mean confidence 0–100, when available. */
  confidence: number | null;
}

export interface OcrOptions {
  /** 0–1 progress for the "recognizing text" phase, for a progress bar. */
  onProgress?: (fraction: number) => void;
}

// Test seam: a page can set window.__mockOcr to bypass the real engine.
type MockOcr = (image: OcrImage) => string | OcrResult | Promise<string | OcrResult>;
function getMock(): MockOcr | undefined {
  return (globalThis as { __mockOcr?: MockOcr }).__mockOcr;
}

function toResult(value: string | OcrResult): OcrResult {
  if (typeof value !== "string") return value;
  return {
    text: value,
    lines: splitLines(value),
    confidence: null,
  };
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// One worker, reused across analyses. Created on first real recognition.
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker(onProgress?: (fraction: number) => void) {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    workerPromise = createWorker("fra", undefined, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress?.(m.progress);
      },
    });
  }
  return workerPromise;
}

/** Recognize the text in an image. Uses window.__mockOcr in tests if present. */
export async function recognizeImage(
  image: OcrImage,
  options: OcrOptions = {},
): Promise<OcrResult> {
  const mock = getMock();
  if (mock) {
    options.onProgress?.(1);
    return toResult(await mock(image));
  }

  const worker = await getWorker(options.onProgress);
  const { data } = await worker.recognize(image);
  return {
    text: data.text,
    lines: splitLines(data.text),
    confidence: typeof data.confidence === "number" ? data.confidence : null,
  };
}

/** Release the OCR worker (e.g. when done with a session). Safe to call anytime. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
