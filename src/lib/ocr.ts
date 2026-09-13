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

/** One recognized word and where it sits in the image (natural pixels). */
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number | null;
}

export interface OcrResult {
  /** Full recognized text. */
  text: string;
  /** `text` split into non-empty trimmed lines. */
  lines: string[];
  /** Mean confidence 0–100, when available. */
  confidence: number | null;
  /** Word boxes, when requested (see OcrOptions.boxes). */
  words: OcrWord[];
}

export interface OcrOptions {
  /** 0–1 progress for the "recognizing text" phase, for a progress bar. */
  onProgress?: (fraction: number) => void;
  /** Also return per-word bounding boxes (used to auto-locate the panel). */
  boxes?: boolean;
}

// Test seam: a page can set window.__mockOcr to bypass the real engine.
type MockOcr = (image: OcrImage) => string | OcrResult | Promise<string | OcrResult>;
function getMock(): MockOcr | undefined {
  return (globalThis as { __mockOcr?: MockOcr }).__mockOcr;
}

function toResult(value: string | OcrResult): OcrResult {
  if (typeof value !== "string") return { ...value, words: value.words ?? [] };
  return {
    text: value,
    lines: splitLines(value),
    confidence: null,
    words: [],
  };
}

/** Flatten Tesseract's block/paragraph/line/word tree (v7) into a word list. */
function collectWords(data: unknown): OcrWord[] {
  const d = data as {
    words?: unknown[];
    blocks?: Array<{
      paragraphs?: Array<{ lines?: Array<{ words?: unknown[] }> }>;
    }>;
  };
  const raw: unknown[] = Array.isArray(d.words)
    ? d.words
    : (d.blocks ?? []).flatMap((b) =>
        (b.paragraphs ?? []).flatMap((p) => (p.lines ?? []).flatMap((l) => l.words ?? [])),
      );
  const out: OcrWord[] = [];
  for (const w of raw) {
    const word = w as {
      text?: string;
      confidence?: number;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
    };
    if (!word?.bbox || !word.text) continue;
    out.push({
      text: word.text,
      bbox: word.bbox,
      confidence: typeof word.confidence === "number" ? word.confidence : null,
    });
  }
  return out;
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// One worker, reused across analyses. Created on first real recognition.
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

/** Absolute URL of a vendored asset, resolved against the app's base (works on
 *  the GitHub Pages subpath and locally). */
function vendorUrl(path: string): string {
  return new URL(
    import.meta.env.BASE_URL + path,
    window.location.href,
  ).toString();
}

async function getWorker(onProgress?: (fraction: number) => void) {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    // Everything is self-hosted (see scripts/prepare-tesseract.mjs) so OCR runs
    // fully offline — no CDN at runtime.
    workerPromise = createWorker("fra", 1, {
      workerPath: vendorUrl("vendor/tesseract/worker.min.js"),
      corePath: vendorUrl("vendor/tesseract/"),
      langPath: vendorUrl("vendor/tessdata"),
      gzip: true,
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
  const { data } = options.boxes
    ? await worker.recognize(image, {}, { text: true, blocks: true })
    : await worker.recognize(image);
  return {
    text: data.text,
    lines: splitLines(data.text),
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    words: options.boxes ? collectWords(data) : [],
  };
}

/** Release the OCR worker (e.g. when done with a session). Safe to call anytime. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
