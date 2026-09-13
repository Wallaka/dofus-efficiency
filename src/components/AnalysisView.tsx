import type {
  ScreenshotAnalysis,
  ScreenshotKind,
  ItemCategory,
} from "../lib/screenshotAnalysis";
import { formatKamas } from "../lib/format";

export const KIND_LABEL: Record<ScreenshotKind, string> = {
  "market-trend": "Cours du marché",
  hdv: "Hôtel de vente",
  "hdv-sell": "HDV (vente)",
  "item-tooltip": "Infobulle d'objet",
  inventory: "Inventaire",
  "character-sheet": "Fiche perso",
  other: "Autre écran",
  unknown: "Indéterminé",
};

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  resource: "Ressource",
  weapon: "Arme",
  equipment: "Équipement",
  unknown: "Type inconnu",
};

/**
 * Presentational view of one screenshot's OCR reading: screen type, item, the
 * moyen/médian prices, articles sold, and the per-quantity lot prices. Shared by
 * the detail modal and the inline card in the listing so both show exactly what
 * was read. Actions (accept / re-analyse) are passed as `children`.
 */
export function AnalysisView({
  analysis,
  dates,
  children,
}: {
  analysis: ScreenshotAnalysis;
  dates: string[];
  children?: React.ReactNode;
}) {
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

      {analysis.set && <p className="analysis-sub">Panoplie&nbsp;: {analysis.set}</p>}

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

      {analysis.note && <p className="analysis-note">{analysis.note}</p>}

      {children}
    </div>
  );
}
