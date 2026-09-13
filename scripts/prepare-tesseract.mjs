/**
 * Vendor Tesseract so OCR runs fully offline (no CDN at runtime).
 *
 * Copies the worker + LSTM core builds out of node_modules and downloads the
 * French language data into public/vendor/, which Vite serves from the app's own
 * origin. Runs before dev and build (see package.json). The output is gitignored,
 * so no large binaries live in the repo — CI regenerates it each build.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreSrc = join(root, "node_modules", "tesseract.js-core");
const workerSrc = join(root, "node_modules", "tesseract.js", "dist", "worker.min.js");
const outTess = join(root, "public", "vendor", "tesseract");
const outData = join(root, "public", "vendor", "tessdata");

// The "fast" French model (~600 KB gz) — the raw.githubusercontent host is
// reachable from both CI and the dev sandbox.
const LANG_URL =
  "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/fra.traineddata.gz";
const langFile = join(outData, "fra.traineddata.gz");

function ensureDir(d) {
  mkdirSync(d, { recursive: true });
}

function copyIfNewer(src, dest) {
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) return;
  copyFileSync(src, dest);
}

function copyCore() {
  if (!existsSync(coreSrc)) throw new Error(`Missing ${coreSrc} — run npm install`);
  ensureDir(outTess);
  // LSTM builds only (OEM 1): the .js glue, .wasm, and .wasm.js single-file build.
  const files = readdirSync(coreSrc).filter((f) => f.includes("lstm"));
  for (const f of files) copyIfNewer(join(coreSrc, f), join(outTess, f));
  copyIfNewer(workerSrc, join(outTess, "worker.min.js"));
  return files.length;
}

function downloadLang() {
  ensureDir(outData);
  if (existsSync(langFile) && statSync(langFile).size > 100000) return false;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync("curl", ["-fsSL", "--max-time", "60", "-o", langFile, LANG_URL], {
        stdio: ["ignore", "ignore", "inherit"],
      });
      if (statSync(langFile).size > 100000) return true;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Failed to download ${LANG_URL}: ${lastErr}`);
}

const n = copyCore();
const downloaded = downloadLang();
console.log(
  `[prepare-tesseract] vendored ${n} core files + worker; language data ${downloaded ? "downloaded" : "already present"}.`,
);
