import { useRef, useState } from "react";
import type { CropRect } from "../lib/cropImage";

interface Props {
  src: string;
  alt: string;
  /** An auto-chosen crop (natural px) to show when the user hasn't drawn one. */
  autoRect?: CropRect | null;
  /** Called with the selection in the image's natural pixels, or null if cleared. */
  onSelectionChange: (rect: CropRect | null) => void;
}

/** A selection rectangle stored as fractions (0–1) of the image, so it survives resize. */
interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_AREA = 0.0004; // ignore accidental tiny drags (≈ a click)

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/**
 * Shows an image and lets the user drag a rectangle over it. Emits the selection
 * in the image's natural pixel coordinates so it can be cropped for OCR.
 */
export function CropSelector({ src, alt, autoRect, onSelectionChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const selRef = useRef<Frac | null>(null);
  const [sel, setSel] = useState<Frac | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Convert the auto-crop (natural px) to fractions once the image is sized.
  const autoFrac: Frac | null =
    autoRect && loaded && imgRef.current?.naturalWidth
      ? {
          x: autoRect.x / imgRef.current.naturalWidth,
          y: autoRect.y / imgRef.current.naturalHeight,
          w: autoRect.width / imgRef.current.naturalWidth,
          h: autoRect.height / imgRef.current.naturalHeight,
        }
      : null;

  function updateSel(next: Frac | null) {
    selRef.current = next;
    setSel(next);
  }

  function pointToFrac(clientX: number, clientY: number): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function emit(frac: Frac | null) {
    const img = imgRef.current;
    if (!frac || !img || !img.naturalWidth) {
      onSelectionChange(null);
      return;
    }
    onSelectionChange({
      x: frac.x * img.naturalWidth,
      y: frac.y * img.naturalHeight,
      width: frac.w * img.naturalWidth,
      height: frac.h * img.naturalHeight,
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    start.current = pointToFrac(e.clientX, e.clientY);
    updateSel({ ...start.current, w: 0, h: 0 });
    wrapRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const cur = pointToFrac(e.clientX, e.clientY);
    updateSel({
      x: Math.min(start.current.x, cur.x),
      y: Math.min(start.current.y, cur.y),
      w: Math.abs(cur.x - start.current.x),
      h: Math.abs(cur.y - start.current.y),
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!start.current) return;
    start.current = null;
    wrapRef.current?.releasePointerCapture(e.pointerId);
    const s = selRef.current;
    if (!s || s.w * s.h < MIN_AREA) {
      updateSel(null);
      emit(null);
    } else {
      emit(s);
    }
  }

  function clear() {
    updateSel(null);
    emit(null);
  }

  return (
    <div className="crop">
      <div
        ref={wrapRef}
        className="crop-area"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
        {!sel && autoFrac && (
          <div
            className="crop-box crop-box-auto"
            style={{
              left: `${autoFrac.x * 100}%`,
              top: `${autoFrac.y * 100}%`,
              width: `${autoFrac.w * 100}%`,
              height: `${autoFrac.h * 100}%`,
            }}
          />
        )}
        {sel && (
          <div
            className="crop-box"
            style={{
              left: `${sel.x * 100}%`,
              top: `${sel.y * 100}%`,
              width: `${sel.w * 100}%`,
              height: `${sel.h * 100}%`,
            }}
          />
        )}
      </div>
      {sel ? (
        <button type="button" className="folder-secondary crop-clear" onClick={clear}>
          Effacer la sélection
        </button>
      ) : (
        <p className="hint crop-hint">
          {autoFrac
            ? "Zone détectée automatiquement — glissez pour la corriger."
            : "Astuce : glissez sur l'image pour sélectionner la zone du prix."}
        </p>
      )}
    </div>
  );
}
