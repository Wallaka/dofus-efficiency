import { useState } from "react";
import type { RecipePlan } from "../lib/metierXp";
import type { Item, PriceMap } from "../types";
import { formatKamas } from "../lib/format";
import { PriceInput } from "./PriceInput";

interface Props {
  plan: RecipePlan;
  selected: boolean;
  prices: PriceMap;
  onSelect: () => void;
  onPriceChange: (item: Item, value: number | null) => void;
}

/**
 * One recipe row: click it to plan with it; click the chevron to expand its
 * ingredients and enter/edit their prices inline (so any "prix ?" recipe can be
 * priced right here). Prices write to the shared store.
 */
export function MetierRecipeRow({
  plan,
  selected,
  prices,
  onSelect,
  onPriceChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const { recipe, xpPerCraft, crafts, netCost, netCostPerXp, locked, priced, sellPrice } =
    plan;
  const netStr =
    netCost == null
      ? "—"
      : netCost >= 0
        ? formatKamas(netCost)
        : `+${formatKamas(-netCost)}`;

  return (
    <li className={open ? "metier-ritem open" : "metier-ritem"}>
      <button
        type="button"
        className={`metier-rrow${selected ? " selected" : ""}${locked ? " metier-rrow--locked" : ""}`}
        aria-expanded={open}
        onClick={() => {
          onSelect();
          setOpen((o) => !o);
        }}
      >
        <span className="metier-rchevron" aria-hidden>
          ›
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
              {locked && <span className="metier-lock">🔒 dès niv {recipe.resultLevel}</span>}
              {!priced && <span className="metier-unpriced">prix ?</span>}
            </span>
          </span>
        </span>
        <span className="num metier-xpcraft" title="XP par craft au niveau de départ">
          {xpPerCraft}
        </span>
        <span className="num metier-crafts">{crafts.toLocaleString("fr-FR")}</span>
        <span
          className={`num metier-cost${netCost != null && netCost < 0 ? " metier-profit" : ""}`}
          title="Coût net = ingrédients − revente"
        >
          {netStr}
        </span>
        <span className="num metier-kxp-cell">
          <span className="metier-kxp">
            {netCostPerXp != null ? `${formatKamas(netCostPerXp)}/xp` : "—"}
          </span>
        </span>
      </button>

      {open && (
        <div className="metier-rprices">
          <div className="metier-pcap">Prix des ingrédients (par craft)</div>
          {recipe.ingredients.map((ing) => {
            const unit = prices[ing.item.id];
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
                  <span className="metier-ing-name" title={ing.item.name}>
                    {ing.item.name}
                  </span>
                </span>
                <span className="metier-ing-qty">×{ing.quantity}</span>
                <PriceInput
                  value={unit}
                  needs={unit == null}
                  ariaLabel={`Prix unitaire de ${ing.item.name}`}
                  onCommit={(v) => onPriceChange(ing.item, v)}
                />
                <span
                  className={`metier-ing-total${unit == null ? " missing" : ""}`}
                >
                  {unit != null ? formatKamas(unit * ing.quantity) : "prix ?"}
                </span>
              </div>
            );
          })}

          <div className="metier-pcap">Revente de l'objet crafté (par unité)</div>
          <div className="metier-ing metier-ing--revenue">
            <span className="metier-ing-id">
              <span className="metier-ing-icon">
                {recipe.result.img ? (
                  <img src={recipe.result.img} alt="" />
                ) : (
                  <span aria-hidden>⚒️</span>
                )}
              </span>
              <span className="metier-ing-name" title={recipe.result.name}>
                {recipe.result.name}
              </span>
            </span>
            <span className="metier-ing-qty">vente</span>
            <PriceInput
              value={sellPrice}
              needs={sellPrice == null}
              ariaLabel={`Prix de revente de ${recipe.result.name}`}
              onCommit={(v) => onPriceChange(recipe.result, v)}
            />
            <span className={`metier-ing-total${sellPrice == null ? " missing" : ""}`}>
              {sellPrice != null ? formatKamas(sellPrice) : "à saisir"}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
