import { useState } from "react";
import type { CraftEntry, CraftBenefit } from "../lib/craftList";
import type { Item } from "../types";
import type { PriceEntryMap } from "../lib/priceStore";
import { isStale, relativeAge } from "../lib/priceStore";
import { formatKamas, formatKamasSigned, formatPercent } from "../lib/format";
import { CopyName } from "./CopyName";

interface Props {
  entry: CraftEntry;
  evaluation: CraftBenefit;
  /** HDV sell-tax percentage, for the breakdown label. */
  taxPercent: number;
  /** Shared price map (item id → unit price), read for ingredient/sell prices. */
  prices: Record<string, number | undefined>;
  /** Price entries, for the OCR/manuel source badge on each ingredient. */
  entries: PriceEntryMap;
  /** Item id → quantity owned; when set, only the remainder is priced. */
  stock?: Record<string, number>;
  /** Set/clear an item's manual price (null clears); writes the shared store. */
  onPriceChange: (item: Item, value: number | null) => void;
  /** How many to craft (≥ 1); scales the cost and profit. */
  quantity: number;
  /** Change the craft quantity for this row. */
  onQuantityChange: (quantity: number) => void;
  /** Whether this craft is starred (shown on "Mes crafts"). */
  favourite: boolean;
  /** Toggle the starred state. */
  onToggleFavourite: () => void;
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
  taxPercent,
  prices,
  entries,
  stock,
  quantity,
  favourite,
  onPriceChange,
  onQuantityChange,
  onToggleFavourite,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  // Local draft so the field can be cleared/retyped without snapping to 1.
  const [qtyDraft, setQtyDraft] = useState<string | null>(null);
  const { craftCost, sellPrice, tax, netMargin, netMarginRatio } = evaluation;
  // sellPrice is per unit; the sale total scales with the craft quantity.
  const sells = sellPrice != null ? sellPrice * quantity : undefined;

  const toggle = () => setOpen((o) => !o);

  function commitQty() {
    if (qtyDraft == null) return;
    const n = Math.max(1, Math.floor(Number(qtyDraft)) || 1);
    setQtyDraft(null);
    if (n !== quantity) onQuantityChange(n);
  }

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
          <button
            type="button"
            className={`craft-fav${favourite ? " active" : ""}`}
            aria-pressed={favourite}
            aria-label={
              favourite
                ? `Retirer ${entry.resultItem.name} des favoris`
                : `Ajouter ${entry.resultItem.name} aux favoris`
            }
            title={favourite ? "Retirer des favoris" : "Ajouter aux favoris (Mes crafts)"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavourite();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden
              fill={favourite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 17.77l-5.2 2.74.99-5.8-4.21-4.1 5.82-.85z" />
            </svg>
          </button>
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
          <CopyName text={entry.resultItem.name} />
          <span
            className="craft-qty"
            onClick={(e) => e.stopPropagation()}
            title="Nombre à crafter — met à l'échelle le coût et le bénéfice"
          >
            <button
              type="button"
              className="craft-qty-btn"
              aria-label="Diminuer la quantité"
              disabled={quantity <= 1}
              onClick={(e) => {
                e.stopPropagation();
                onQuantityChange(Math.max(1, quantity - 1));
              }}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="craft-qty-input"
              aria-label={`Quantité à crafter de ${entry.resultItem.name}`}
              value={qtyDraft ?? String(quantity)}
              onChange={(e) => {
                setQtyDraft(e.target.value);
                const n = Math.floor(Number(e.target.value));
                if (Number.isFinite(n) && n >= 1) onQuantityChange(n);
              }}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <button
              type="button"
              className="craft-qty-btn"
              aria-label="Augmenter la quantité"
              onClick={(e) => {
                e.stopPropagation();
                onQuantityChange(quantity + 1);
              }}
            >
              +
            </button>
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
          <span
            className={`craft-benefit-value ${benefitClass(netMargin)}`}
            title={
              quantity > 1
                ? `Bénéfice net total pour ${quantity} crafts`
                : "Bénéfice net = prix de vente − taxe HDV − coût de craft"
            }
          >
            {netMargin != null ? formatKamasSigned(netMargin) : "—"}
          </span>
          {quantity > 1 && (
            <span className="craft-qty-note">total ×{quantity}</span>
          )}
        </span>

        <span className="col-num m-hide-margin">
          <span className={`craft-margin ${benefitClass(netMargin)}`}>
            {netMarginRatio != null ? formatPercent(netMarginRatio) : "—"}
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
            const totalQty = ing.quantity * quantity;
            const owned = Math.min(stock?.[ing.item.id] ?? 0, totalQty);
            const need = totalQty - owned;
            const subtotal =
              need === 0 ? 0 : unit != null ? unit * need : undefined;
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
                    {owned > 0 ? (
                      <span
                        className={`craft-ing-stock${need === 0 ? " full" : ""}`}
                      >
                        −{owned} en stock · {need} à acheter
                      </span>
                    ) : (
                      <IngredientSub
                        item={ing.item}
                        price={unit}
                        entries={entries}
                      />
                    )}
                  </span>
                  <CopyName text={ing.item.name} />
                </span>
                <span className="craft-ing-qty">{totalQty} ×</span>
                <PriceInput
                  value={unit}
                  needs={unit == null && need > 0}
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

          <dl className="craft-recap">
            {quantity > 1 && (
              <div className="craft-recap-row">
                <dt>Quantité</dt>
                <dd>× {quantity}</dd>
              </div>
            )}
            <div className="craft-recap-row">
              <dt>{quantity > 1 ? `Ventes (× ${quantity})` : "Prix de vente"}</dt>
              <dd>{formatKamas(sells)}</dd>
            </div>
            <div className="craft-recap-row">
              <dt>Taxe HDV ({taxPercent} %)</dt>
              <dd className="neg">
                {tax != null && tax > 0 ? `− ${formatKamas(tax)}` : "—"}
              </dd>
            </div>
            <div className="craft-recap-row">
              <dt>Coût de craft</dt>
              <dd className="neg">
                {craftCost != null ? `− ${formatKamas(craftCost)}` : "prix manquant"}
              </dd>
            </div>
            <div className="craft-recap-row craft-recap-total">
              <dt>Bénéfice net</dt>
              <dd className={benefitClass(netMargin)}>
                {netMargin != null ? formatKamasSigned(netMargin) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}
