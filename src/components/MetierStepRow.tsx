import { useState } from "react";
import type { MetierStep } from "../lib/metierXp";
import type { Item } from "../types";
import type { PriceEntryMap } from "../lib/priceStore";
import { isStale, relativeAge } from "../lib/priceStore";
import { formatKamas } from "../lib/format";
import { PriceInput } from "./PriceInput";

interface Props {
  step: MetierStep;
  /** Price entries, for the OCR/manuel source badge on each ingredient. */
  entries: PriceEntryMap;
  onPriceChange: (item: Item, value: number | null) => void;
}

/** One palier of the leveling plan: a summary row, expandable to its shopping list. */
export function MetierStepRow({ step, entries, onPriceChange }: Props) {
  const [open, setOpen] = useState(false);
  const { recipe, xpPerCraft, crafts, cost, costPerXp } = step;
  const toggle = () => setOpen((o) => !o);

  return (
    <li className={`metier-step${open ? " open" : ""}`}>
      <div className="metier-row-main" onClick={toggle}>
        <button
          type="button"
          className="metier-chevron"
          aria-expanded={open}
          aria-label={open ? "Replier" : "Voir la liste de courses"}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          ›
        </button>

        <span className="metier-palier">
          <strong>
            {step.fromLevel}–{step.toLevel}
          </strong>
        </span>

        <span className="metier-recipe">
          <span className="metier-thumb">
            {recipe.result.img ? (
              <img src={recipe.result.img} alt="" />
            ) : (
              <span aria-hidden>⚒️</span>
            )}
          </span>
          <span className="metier-recipe-text">
            <span className="metier-recipe-name" title={recipe.result.name}>
              {recipe.result.name}
            </span>
            <span className="metier-recipe-meta">
              Niv. {recipe.resultLevel}
              <span className="metier-slots">{recipe.slots} cases</span>
            </span>
          </span>
        </span>

        <span className="num metier-xpcraft" title="XP par craft (estimée)">
          {xpPerCraft}
        </span>
        <span className="num metier-crafts">{crafts.toLocaleString("fr-FR")}</span>
        <span className="num metier-cost">
          {cost != null ? formatKamas(cost) : "—"}
        </span>
        <span className="num metier-kxp-cell">
          <span className="metier-kxp">
            {costPerXp != null ? `${formatKamas(costPerXp)}/xp` : "—"}
          </span>
        </span>
      </div>

      {open && (
        <div className="metier-detail">
          <div className="metier-detail-cap" aria-hidden>
            <span className="c-name">Liste de courses (palier)</span>
            <span className="c-qty">Qté</span>
            <span className="c-price">Prix unit.</span>
            <span className="c-total">Sous-total</span>
          </div>
          {step.ingredients.map((ing) => {
            const entry = entries[ing.item.id];
            const tag =
              ing.unitPrice == null
                ? { label: "à saisir", cls: "todo" }
                : entry?.source === "ocr"
                  ? { label: "OCR", cls: "ocr" }
                  : { label: "manuel", cls: "" };
            return (
              <div className="metier-ing" key={ing.item.id}>
                <span className="metier-ing-id">
                  <span className="metier-ing-icon">
                    {ing.item.img ? (
                      <img src={ing.item.img} alt="" />
                    ) : (
                      <span aria-hidden>▪</span>
                    )}
                  </span>
                  <span className="metier-recipe-text">
                    <span className="metier-ing-name" title={ing.item.name}>
                      {ing.item.name}
                    </span>
                    <span className="metier-ing-sub">
                      <span className={`metier-src ${tag.cls}`}>{tag.label}</span>
                      {entry?.updatedAt != null && (
                        <span className={isStale(entry.updatedAt) ? "stale" : ""}>
                          {relativeAge(entry.updatedAt)}
                        </span>
                      )}
                    </span>
                  </span>
                </span>
                <span className="metier-ing-qty">
                  {ing.quantity.toLocaleString("fr-FR")}
                </span>
                <PriceInput
                  value={ing.unitPrice}
                  needs={ing.unitPrice == null}
                  ariaLabel={`Prix unitaire de ${ing.item.name}`}
                  onCommit={(v) => onPriceChange(ing.item, v)}
                />
                <span
                  className={`metier-ing-total${ing.subtotal == null ? " missing" : ""}`}
                >
                  {ing.subtotal != null ? formatKamas(ing.subtotal) : "prix ?"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
