import type { RecipePlan } from "../lib/metierXp";
import { formatKamas } from "../lib/format";

interface Props {
  plan: RecipePlan;
  selected: boolean;
  onSelect: () => void;
}

/** One recipe with its crafts-to-target / cost, selectable to plan or price it. */
export function MetierRecipeRow({ plan, selected, onSelect }: Props) {
  const { recipe, xpPerCraft, crafts, cost, costPerXp, locked, priced } = plan;
  return (
    <li>
      <button
        type="button"
        className={`metier-rrow${selected ? " selected" : ""}${locked ? " metier-rrow--locked" : ""}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="metier-radio" aria-hidden>
          {selected ? "●" : "○"}
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
        <span className="num metier-cost">
          {cost != null ? formatKamas(cost) : "—"}
        </span>
        <span className="num metier-kxp-cell">
          <span className="metier-kxp">
            {costPerXp != null ? `${formatKamas(costPerXp)}/xp` : "—"}
          </span>
        </span>
      </button>
    </li>
  );
}
