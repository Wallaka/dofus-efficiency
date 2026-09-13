import { useState } from "react";
import type { CraftEntry } from "../lib/craftList";
import type { CraftEvaluation, Item } from "../types";
import type { PriceEntryMap } from "../lib/priceStore";
import { isStale, relativeAge } from "../lib/priceStore";
import { formatKamas, formatKamasSigned, formatPercent } from "../lib/format";

interface Props {
  entry: CraftEntry;
  evaluation: CraftEvaluation;
  /** Shared price map (item id → unit price), read for ingredient/sell prices. */
  prices: Record<string, number | undefined>;
  /** Price entries, for the OCR/manuel source badge on each ingredient. */
  entries: PriceEntryMap;
  /** Set/clear an item's manual price (null clears); writes the shared store. */
  onPriceChange: (item: Item, value: number | null) => void;
  onRemove: () => void;
}

/**
 * An editable price field. Keeps a local draft while typing and only writes on
 * blur/Enter when the value actually changed — so showing an OCR price never
 * silently rewrites it as manual. (Same behaviour as the Avis cards.)
 */
function PriceInput({
  value,
  ariaLabel,
  needs,
  width = 74,
  onCommit,
}: {
  value?: number;
  ariaLabel: string;
  needs?: boolean;
  width?: number;
  onCommit: (value: number | null) => void;
}) {
  const stored = value != null ? String(value) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? stored;

  function commit() {
    if (draft == null) return; // untouched
    const cleaned = draft.trim().replace(/[  ]/g, "");
    setDraft(null);
    if (cleaned === "") {
      if (value != null) onCommit(null);
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== value) onCommit(n);
  }

  return (
    <span className="craft-price-edit">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        style={{ width }}
        className={needs ? "needs" : undefined}
        aria-label={ariaLabel}
        placeholder="—"
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        // Don't toggle the row when interacting with the input.
        onClick={(e) => e.stopPropagation()}
      />
      <span className="craft-unit">k</span>
    </span>
  );
}

function benefitClass(margin: number | undefined): string {
  if (margin == null) return "unknown";
  if (margin > 0) return "pos";
  if (margin < 0) return "neg";
  return "";
}

/** Source badge (OCR / manuel / à saisir) + freshness age for one ingredient. */
function IngredientSub({
  item,
  price,
  entries,
}: {
  item: Item;
  price?: number;
  entries: PriceEntryMap;
}) {
  const entry = entries[item.id];
  const tag =
    price == null
      ? { label: "à saisir", cls: "craft-src--todo" }
      : entry?.source === "ocr"
        ? { label: "OCR", cls: "craft-src--ocr" }
        : { label: "manuel", cls: "" };
  return (
    <span className="craft-ing-sub">
      <span className={`craft-src ${tag.cls}`}>{tag.label}</span>
      {entry?.updatedAt != null && (
        <span className={`craft-age${isStale(entry.updatedAt) ? " stale" : ""}`}>
          {relativeAge(entry.updatedAt)}
          {isStale(entry.updatedAt) ? " ⚠" : ""}
        </span>
      )}
    </span>
  );
}

/** One craftable item: a summary line, expandable to edit its ingredient prices. */
export function CraftRow({
  entry,
  evaluation,
  prices,
  entries,
  onPriceChange,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const { craftCost, sellPrice, margin, marginRatio } = evaluation;

  const toggle = () => setOpen((o) => !o);

  return (
    <li className={`craft-item${open ? " open" : ""}`}>
      {/* A div, not a button: the row holds inputs (invalid inside a button).
          The chevron button carries the keyboard/a11y toggle. */}
      <div className="craft-row-main" onClick={toggle}>
        <button
          type="button"
          className="craft-chevron"
          aria-expanded={open}
          aria-label={open ? "Replier les ingrédients" : "Voir les ingrédients"}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          ›
        </button>
        <span className="craft-id">
          <span className="craft-thumb">
            {entry.resultItem.img ? (
              <img src={entry.resultItem.img} alt="" />
            ) : (
              <span aria-hidden>⚒️</span>
            )}
          </span>
          <span className="craft-id-text">
            <span className="craft-name" title={entry.resultItem.name}>
              {entry.resultItem.name}
            </span>
            <span className="craft-job">
              {[entry.job, entry.resultItem.level != null && `Niv. ${entry.resultItem.level}`]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          </span>
        </span>

        <span className="col-num craft-cost">
          {craftCost != null ? (
            formatKamas(craftCost)
          ) : (
            <>
              {/* Partial cost is intentionally not shown as a total. */}
              <span>—</span>
              <span className="incomplete">prix manquant</span>
            </>
          )}
        </span>

        <span className="col-num m-hide-sell">
          <PriceInput
            value={sellPrice}
            width={78}
            ariaLabel={`Prix de vente de ${entry.resultItem.name}`}
            onCommit={(v) => onPriceChange(entry.resultItem, v)}
          />
        </span>

        <span className="col-num">
          <span className={`craft-benefit-value ${benefitClass(margin)}`}>
            {margin != null ? formatKamasSigned(margin) : "—"}
          </span>
        </span>

        <span className="col-num m-hide-margin">
          <span className={`craft-margin ${benefitClass(margin)}`}>
            {marginRatio != null ? formatPercent(marginRatio) : "—"}
          </span>
        </span>

        <button
          type="button"
          className="craft-remove"
          title="Retirer de la liste"
          aria-label={`Retirer ${entry.resultItem.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </div>

      {open && (
        <div className="craft-detail">
          <div className="craft-detail-caption" aria-hidden>
            <span className="cap-name">Ingrédients</span>
            <span className="cap-qty">Qté</span>
            <span className="cap-price">Prix unit.</span>
            <span className="cap-total">Sous-total</span>
          </div>
          {entry.ingredients.map((ing) => {
            const unit = prices[ing.item.id];
            const subtotal = unit != null ? unit * ing.quantity : undefined;
            return (
              <div className="craft-ing" key={ing.item.id}>
                <span className="craft-ing-id">
                  <span className="craft-ing-icon">
                    {ing.item.img ? (
                      <img src={ing.item.img} alt="" />
                    ) : (
                      <span aria-hidden>▪</span>
                    )}
                  </span>
                  <span className="craft-ing-body">
                    <span className="craft-ing-name" title={ing.item.name}>
                      {ing.item.name}
                    </span>
                    <IngredientSub
                      item={ing.item}
                      price={unit}
                      entries={entries}
                    />
                  </span>
                </span>
                <span className="craft-ing-qty">{ing.quantity} ×</span>
                <PriceInput
                  value={unit}
                  needs={unit == null}
                  ariaLabel={`Prix unitaire de ${ing.item.name}`}
                  onCommit={(v) => onPriceChange(ing.item, v)}
                />
                <span
                  className={`craft-ing-total${subtotal == null ? " missing" : ""}`}
                >
                  {subtotal != null ? formatKamas(subtotal) : "prix ?"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
