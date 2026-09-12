/**
 * Crop a region out of an image and return it as a PNG blob, optionally scaled
 * up. OCR is much more reliable on a tight crop of just the price/tooltip region
 * (full-screen Dofus captures are mostly noise), and Tesseract reads small text
 * better when it's enlarged — so we upscale the crop while we're at it.
 */

/** A rectangle in the image's own (natural) pixel coordinates. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob a échoué"))),
      "image/png",
    );
  });
}

/**
 * Crop `source` to `rect` (natural pixels) and return a PNG blob enlarged by
 * `scale`. The rect is clamped to the image bounds; an empty/degenerate rect
 * throws so callers can fall back to the full image.
 */
export async function cropImageToBlob(
  source: Blob,
  rect: CropRect,
  scale = 2,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const sx = clamp(rect.x, 0, bitmap.width);
    const sy = clamp(rect.y, 0, bitmap.height);
    const sw = clamp(rect.width, 0, bitmap.width - sx);
    const sh = clamp(rect.height, 0, bitmap.height - sy);
    if (sw < 1 || sh < 1) throw new Error("Sélection trop petite.");

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas);
  } finally {
    bitmap.close?.();
  }
}
