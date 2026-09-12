import type { CraftEvaluation, Item } from "../types";
import { formatKamas, formatPercent } from "../lib/format";

interface Props {
  evaluations: CraftEvaluation[];
  itemsById: Map<string, Item>;
}

function marginClass(margin: number | undefined): string {
  if (margin == null) return "";
  if (margin > 0) return "positive";
  if (margin < 0) return "negative";
  return "";
}

/** Ranked table of recipes by profit per craft. */
export function CraftTable({ evaluations, itemsById }: Props) {
  return (
    <section className="panel">
      <h2>Rentabilité par craft</h2>
      <p className="hint">
        Trié par marge décroissante. La marge n'est calculée que si tous les
        prix nécessaires sont connus.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Objet crafté</th>
              <th>Métier</th>
              <th className="num">Coût craft</th>
              <th className="num">Prix vente</th>
              <th className="num">Marge</th>
              <th className="num">Marge %</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((ev) => (
              <tr key={ev.recipe.id}>
                <td>
                  <span className="item-name">{ev.resultItem.name}</span>
                  <span className="recipe-detail">
                    {ev.recipe.ingredients
                      .map((ing) => {
                        const name =
                          itemsById.get(ing.itemId)?.name ?? ing.itemId;
                        return `${ing.quantity}× ${name}`;
                      })
                      .join(" + ")}
                  </span>
                  {ev.missingPriceItemIds.length > 0 && (
                    <span className="missing">
                      Prix manquant :{" "}
                      {ev.missingPriceItemIds
                        .map((id) => itemsById.get(id)?.name ?? id)
                        .join(", ")}
                    </span>
                  )}
                </td>
                <td>{ev.recipe.job ?? "—"}</td>
                <td className="num">{formatKamas(ev.craftCost)}</td>
                <td className="num">{formatKamas(ev.sellPrice)}</td>
                <td className={`num ${marginClass(ev.margin)}`}>
                  {formatKamas(ev.margin)}
                </td>
                <td className={`num ${marginClass(ev.margin)}`}>
                  {formatPercent(ev.marginRatio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
