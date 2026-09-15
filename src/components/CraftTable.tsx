import { useEffect, useState } from "react";
import type { CraftEvaluation, Item } from "../types";
import { formatKamas, formatPercent } from "../lib/format";
import { isStale, relativeAge } from "../lib/priceStore";
import { Pagination, PAGE_SIZE } from "./Pagination";
import { CopyName } from "./CopyName";

interface Props {
  evaluations: CraftEvaluation[];
  itemsById: Map<string, Item>;
  /** Item id → when its price was last recorded, for freshness hints. */
  priceUpdatedAt?: Map<string, number>;
}

function marginClass(margin: number | undefined): string {
  if (margin == null) return "";
  if (margin > 0) return "positive";
  if (margin < 0) return "negative";
  return "";
}

/** A small "il y a N j" hint, red when the price is stale. null = no hint. */
function AgeHint({ updatedAt }: { updatedAt: number | undefined }) {
  if (updatedAt == null) return null;
  const stale = isStale(updatedAt);
  return (
    <span
      className={`price-age${stale ? " stale" : ""}`}
      title={stale ? "Prix à mettre à jour" : "Prix récent"}
    >
      {relativeAge(updatedAt)}
    </span>
  );
}

/** Ranked table of recipes by profit per craft, paginated for large datasets. */
export function CraftTable({ evaluations, itemsById, priceUpdatedAt }: Props) {
  /** Oldest price age among a recipe's ingredients (the cost's weakest link). */
  function oldestIngredientAge(ev: CraftEvaluation): number | undefined {
    if (!priceUpdatedAt) return undefined;
    let oldest: number | undefined;
    for (const ing of ev.recipe.ingredients) {
      const t = priceUpdatedAt.get(ing.itemId);
      if (t != null) oldest = oldest == null ? t : Math.min(oldest, t);
    }
    return oldest;
  }

  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(evaluations.length / PAGE_SIZE));

  // Keep the page in range when the dataset changes (e.g. switching source).
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const start = (page - 1) * PAGE_SIZE;
  const pageRows = evaluations.slice(start, start + PAGE_SIZE);

  return (
    <section className="panel">
      <h2>Rentabilité par craft</h2>
      <p className="hint">
        Trié par marge décroissante ({evaluations.length} craft
        {evaluations.length > 1 ? "s" : ""}). La marge n'est calculée que si tous
        les prix nécessaires sont connus.
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
            {pageRows.map((ev) => (
              <tr key={ev.recipe.id}>
                <td>
                  <span className="price-item">
                    <span className="item-name">{ev.resultItem.name}</span>
                    <CopyName text={ev.resultItem.name} />
                  </span>
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
                <td className="num">
                  {formatKamas(ev.craftCost)}
                  {ev.craftCost != null && (
                    <AgeHint updatedAt={oldestIngredientAge(ev)} />
                  )}
                </td>
                <td className="num">
                  {formatKamas(ev.sellPrice)}
                  {ev.sellPrice != null && (
                    <AgeHint updatedAt={priceUpdatedAt?.get(ev.resultItem.id)} />
                  )}
                </td>
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

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </section>
  );
}
