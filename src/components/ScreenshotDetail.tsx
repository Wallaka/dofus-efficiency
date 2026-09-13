import { useEffect, useState } from "react";
import type { ScreenshotInfo } from "../lib/screenshotMeta";
import { recognizeImage } from "../lib/ocr";
import {
  analyzeScreenshot,
  type ScreenshotAnalysis,
  type ScreenshotKind,
  type ItemCategory,
} from "../lib/screenshotAnalysis";
import { type CropRect } from "../lib/cropImage";
import { analyzeImageBlob, cropSafe } from "../lib/analyzeFlow";
import { priceToRecord } from "../lib/priceStore";
import type { Item } from "../types";
import { CropSelector } from "./CropSelector";
import { PriceApplyPanel } from "./PriceApplyPanel";
import { formatKamas, formatDateTime, formatBytes } from "../lib/format";

interface Props {
  file: ScreenshotInfo;
  imageUrl?: string;
  onClose: () => void;
  /** Persist an OCR'd price for a chosen item (the feedback loop). */
  onApplyPrice?: (item: Item, price: number, detail: string) => void;
}

type State =
  | { phase: "idle" }
  | { phase: "running"; progress: number }
  | { phase: "done"; analysis: ScreenshotAnalysis; dates: string[] }
  | { phase: "error"; message: string };

const KIND_LABEL: Record<ScreenshotKind, string> = {
  "market-trend": "Cours du marché",
  hdv: "Hôtel de vente",
  "item-tooltip": "Infobulle d'objet",
  inventory: "Inventaire",
  "character-sheet": "Fiche perso",
  other: "Autre écran",
  unknown: "Indéterminé",
};

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  resource: "Ressource",
  weapon: "Arme",
  equipment: "Équipement",
  unknown: "Type inconnu",
};

/**
 * Detail view for one screenshot: shows the image and, on demand, runs OCR and
 * displays what we could guess — screen type, item category, and (for resources)
 * the x1 / x10 / x100 lot prices.
 */
export function ScreenshotDetail({ file, imageUrl, onClose, onApplyPrice }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  // Manual region to OCR, in natural pixels; null = none drawn.
  const [crop, setCrop] = useState<CropRect | null>(null);
  // Auto-crop on by default; the box it chose (for display).
  const [autoCropOn, setAutoCropOn] = useState(true);
  const [autoRect, setAutoRect] = useState<CropRect | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function analyze() {
    setState({ phase: "running", progress: 0 });
    setAutoRect(null);
    const onProgress = (p: number) => setState({ phase: "running", progress: p });
    try {
      const full = await file.handle.getFile();

      // 1) Manual selection wins: OCR exactly what the user drew.
      if (crop) {
        const ocr = await recognizeImage(await cropSafe(full, crop), { onProgress });
        setState({ phase: "done", analysis: analyzeScreenshot(ocr.text), dates: [] });
        return;
      }

      // 2) No auto-crop: single pass on the whole image.
      if (!autoCropOn) {
        const ocr = await recognizeImage(full, { onProgress });
        setState({ phase: "done", analysis: analyzeScreenshot(ocr.text), dates: [] });
        return;
      }

      // 3) Auto-crop two-pass (shared with the automatic batch analyser): pass 1
      //    classifies + locates the panel, pass 2 re-reads the upscaled crop.
      const { analysis, dates, autoRect: rect } = await analyzeImageBlob(
        full,
        onProgress,
      );
      if (rect) setAutoRect(rect);
      setState({ phase: "done", analysis, dates });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Échec de l'analyse OCR.",
      });
    }
  }

  const analyzeLabel = crop
    ? "Analyser la sélection"
    : autoCropOn
      ? "Analyser (recadrage auto)"
      : "Analyser (OCR)";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={`Capture ${file.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 title={file.name}>{file.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-image">
            {imageUrl ? (
              <CropSelector
                src={imageUrl}
                alt={file.name}
                autoRect={autoRect}
                onSelectionChange={setCrop}
              />
            ) : (
              <span className="thumb-placeholder">🖼️</span>
            )}
            <p className="screenshot-sub">
              {formatDateTime(file.capturedAt)} · {formatBytes(file.size)}
            </p>
            <label className="auto-crop-toggle">
              <input
                type="checkbox"
                checked={autoCropOn}
                onChange={(e) => setAutoCropOn(e.target.checked)}
              />
              Recadrage automatique (zone du prix)
            </label>
          </div>

          <div className="modal-analysis">
            {state.phase === "idle" && (
              <>
                <p className="hint">
                  Lancez la reconnaissance pour deviner le type d'écran et lire les
                  prix. Le premier passage télécharge le moteur OCR (~quelques Mo).
                </p>
                <button type="button" className="folder-pick" onClick={analyze}>
                  {analyzeLabel}
                </button>
              </>
            )}

            {state.phase === "running" && (
              <div>
                <p className="hint">Lecture en cours…</p>
                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.round(state.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {state.phase === "error" && (
              <>
                <p className="folder-error">{state.message}</p>
                <button type="button" className="folder-secondary" onClick={analyze}>
                  Réessayer
                </button>
              </>
            )}

            {state.phase === "done" && (
              <AnalysisView
                analysis={state.analysis}
                dates={state.dates}
                onReanalyze={analyze}
                reanalyzeLabel={analyzeLabel}
                onApplyPrice={onApplyPrice}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisView({
  analysis,
  dates,
  onReanalyze,
  reanalyzeLabel,
  onApplyPrice,
}: {
  analysis: ScreenshotAnalysis;
  dates: string[];
  onReanalyze: () => void;
  reanalyzeLabel: string;
  onApplyPrice?: (item: Item, price: number, detail: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const recordable = priceToRecord(analysis);
  return (
    <div className="analysis">
      <div className="analysis-tags">
        <span className="tag tag-kind">{KIND_LABEL[analysis.kind]}</span>
        <span className="tag tag-cat">{CATEGORY_LABEL[analysis.category]}</span>
      </div>

      {analysis.itemName && (
        <p className="analysis-name">
          <strong>{analysis.itemName}</strong>
          {(analysis.level != null || analysis.itemType) && (
            <span className="analysis-sub">
              {" "}
              {analysis.itemType}
              {analysis.level != null ? ` · Niv. ${analysis.level}` : ""}
            </span>
          )}
        </p>
      )}

      {analysis.set && (
        <p className="analysis-sub">Panoplie&nbsp;: {analysis.set}</p>
      )}

      {analysis.averagePrice != null && (
        <p className="analysis-price">
          Prix moyen&nbsp;: <strong>{formatKamas(analysis.averagePrice)}</strong>
        </p>
      )}

      {analysis.medianPrice != null && (
        <p className="analysis-sub">
          Prix médian&nbsp;: {formatKamas(analysis.medianPrice)}
        </p>
      )}

      {analysis.articlesSold != null && (
        <p className="analysis-sub">
          Articles vendus&nbsp;: {analysis.articlesSold.toLocaleString("fr-FR")}
        </p>
      )}

      {analysis.lots.length > 0 && (
        <table className="lots">
          <thead>
            <tr>
              <th>Lot</th>
              <th className="num">Prix</th>
              <th className="num">Prix / unité</th>
            </tr>
          </thead>
          <tbody>
            {analysis.lots.map((lot) => (
              <tr key={lot.quantity}>
                <td>×{lot.quantity}</td>
                <td className="num">{formatKamas(lot.price ?? undefined)}</td>
                <td className="num">{formatKamas(lot.unitPrice ?? undefined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dates.length > 0 && (
        <p className="analysis-sub">
          Période lue&nbsp;: {dates.length} jours ({dates[0]} →{" "}
          {dates[dates.length - 1]}). Le prix retenu est le prix médian/moyen
          ci-dessus.
        </p>
      )}

      <p className="analysis-note">{analysis.note}</p>

      {onApplyPrice && recordable && (
        <PriceApplyPanel
          itemName={analysis.itemName}
          price={recordable.price}
          detail={recordable.detail}
          onApply={onApplyPrice}
        />
      )}

      <div className="folder-actions">
        <button type="button" className="folder-secondary" onClick={onReanalyze}>
          {reanalyzeLabel}
        </button>
        <button
          type="button"
          className="folder-secondary"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Masquer le texte OCR" : "Voir le texte OCR"}
        </button>
      </div>

      {showRaw && <pre className="raw-ocr">{analysis.rawText || "(vide)"}</pre>}
    </div>
  );
}
