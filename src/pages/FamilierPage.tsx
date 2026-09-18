import { useEffect, useMemo, useState } from "react";
import type { Item } from "../types";
import type { CatalogItem } from "../data/catalog";
import {
  loadFamilier,
  saveFamilier,
  evaluateFood,
  rankFoods,
  PET_TARGET_XP,
  type FamilierInput,
  type FoodResult,
} from "../lib/familier";
import { usePrices } from "../lib/usePrices";
import { formatKamas } from "../lib/format";
import { CatalogAutocomplete } from "../components/CatalogAutocomplete";
import { PriceInput } from "../components/PriceInput";
import { CopyName } from "../components/CopyName";

/** A plain integer with thousands separators, e.g. 196159 -> "196 159". */
function num(value: number | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("fr-FR");
}

/**
 * The "Familier" page: the cheapest way to feed a pet to level 100 (to resell).
 * You list candidate foods from the catalog, give each an XP-per-unit and a
 * price, and the page ranks them by kamas/XP and shows what a level-100 pet
 * costs with the cheapest one. XP/feeding is modelled generically (see below).
 */
export function FamilierPage() {
  const [input, setInput] = useState<FamilierInput>(loadFamilier);
  const { prices, setPrice, clearPrice } = usePrices();

  useEffect(() => {
    saveFamilier(input);
  }, [input]);

  function patch(patch: Partial<FamilierInput>) {
    setInput((prev) => ({ ...prev, ...patch }));
  }

  function addFood(item: CatalogItem) {
    setInput((prev) =>
      prev.foods.some((f) => f.itemId === item.id)
        ? prev
        : {
            ...prev,
            foods: [
              ...prev.foods,
              { itemId: item.id, name: item.name, img: item.img, xp: undefined },
            ],
          },
    );
  }

  function removeFood(itemId: string) {
    patch({ foods: input.foods.filter((f) => f.itemId !== itemId) });
  }

  function setFoodXp(itemId: string, raw: string) {
    const n = Math.floor(Number(raw));
    const xp = raw.trim() === "" || !Number.isFinite(n) || n <= 0 ? undefined : n;
    patch({
      foods: input.foods.map((f) => (f.itemId === itemId ? { ...f, xp } : f)),
    });
  }

  function onPriceChange(item: Item, value: number | null) {
    if (value == null) clearPrice(item.id);
    else setPrice(item, value);
  }

  const targetXp = input.targetXp || PET_TARGET_XP;

  // Cost every food, then rank cheapest kamas/XP first.
  const results = useMemo(
    () => rankFoods(input.foods.map((f) => evaluateFood(f, prices, targetXp))),
    [input.foods, prices, targetXp],
  );

  // The cheapest fully-priced food drives the tiles and the highlighted row.
  const best: FoodResult | undefined = results.find((r) => r.priced);
  const pickedIds = useMemo(
    () => new Set(input.foods.map((f) => f.itemId)),
    [input.foods],
  );

  return (
    <main className="familier-page">
      <section className="panel">
        <h2>Familier</h2>
        <p className="hint">
          Le moyen le moins cher de monter un familier au niveau 100 (pour le
          revendre). Ajoutez des aliments, donnez à chacun son XP par unité et son
          prix&nbsp;: on les classe par kamas/XP et on affiche ce que coûte un
          familier 100 avec le moins cher. Un familier a besoin de{" "}
          <b>{num(PET_TARGET_XP)} XP</b> pour atteindre le niveau 100.
        </p>
        <p className="hint familier-caveat">
          ⚠ Modèle simplifié&nbsp;: en jeu, chaque familier mange des aliments
          précis, avec un délai entre deux repas et parfois un max d'XP par repas.
          Ici on compare seulement les coûts (XP générique par ressource).
        </p>

        <div className="familier-controls">
          <div className="familier-field">
            <label htmlFor="familier-target">XP objectif</label>
            <input
              id="familier-target"
              type="number"
              min={1}
              inputMode="numeric"
              value={input.targetXp || ""}
              placeholder={String(PET_TARGET_XP)}
              onChange={(e) =>
                patch({ targetXp: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
              }
            />
            <span className="hint">niv. 100 = {num(PET_TARGET_XP)}</span>
          </div>
          <div className="familier-add">
            <label>Ajouter un aliment</label>
            <CatalogAutocomplete
              onPick={addFood}
              isPicked={(id) => pickedIds.has(id)}
              placeholder="Rechercher une ressource… (ex. Croquette)"
            />
          </div>
        </div>
      </section>

      {best && (
        <div className="familier-tiles">
          <div className="familier-tile accent">
            <span className="familier-tile-label">Le moins cher</span>
            <span className="familier-tile-value">{formatKamas(best.totalCost)}</span>
            <span className="familier-tile-sub">
              {num(best.unitsNeeded)} × {best.food.name}
            </span>
          </div>
          <div className="familier-tile">
            <span className="familier-tile-label">kamas / XP</span>
            <span className="familier-tile-value">
              {best.perXp != null
                ? best.perXp.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
                : "—"}
            </span>
            <span className="familier-tile-sub">meilleur ratio</span>
          </div>
        </div>
      )}

      {input.foods.length === 0 ? (
        <p className="hint">
          Aucun aliment. Cherchez une ressource ci-dessus (la croquette enrichie
          donne 500 XP) pour commencer.
        </p>
      ) : (
        <section className="panel">
          <ul className="familier-list">
            <li className="familier-head" aria-hidden>
              <span>Aliment</span>
              <span className="num">XP/unité</span>
              <span className="num">Prix</span>
              <span className="num">kamas/XP</span>
              <span className="num">Unités</span>
              <span className="num">Coût total</span>
              <span></span>
            </li>
            {results.map((r) => (
              <li
                key={r.food.itemId}
                className={`familier-row${best && r.food.itemId === best.food.itemId ? " familier-best" : ""}`}
              >
                <span className="familier-name-cell">
                  <span className="familier-icon">
                    {r.food.img ? (
                      <img src={r.food.img} alt="" />
                    ) : (
                      <span aria-hidden>▪</span>
                    )}
                  </span>
                  <span className="familier-name" title={r.food.name}>
                    {r.food.name}
                  </span>
                  <CopyName text={r.food.name} />
                </span>
                <span className="num">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="familier-xp-input"
                    aria-label={`XP par unité de ${r.food.name}`}
                    placeholder="XP"
                    value={r.food.xp ?? ""}
                    onChange={(e) => setFoodXp(r.food.itemId, e.target.value)}
                  />
                </span>
                <span className="num">
                  <PriceInput
                    value={r.price}
                    needs={r.price == null}
                    width={78}
                    ariaLabel={`Prix unitaire de ${r.food.name}`}
                    onCommit={(v) =>
                      onPriceChange(
                        { id: r.food.itemId, name: r.food.name, img: r.food.img },
                        v,
                      )
                    }
                  />
                </span>
                <span className="num familier-perxp">
                  {r.perXp != null
                    ? r.perXp.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
                    : "—"}
                </span>
                <span className="num">{num(r.unitsNeeded)}</span>
                <span className={`num familier-cost${r.totalCost == null ? " missing" : ""}`}>
                  {r.totalCost != null ? formatKamas(r.totalCost) : "—"}
                </span>
                <span className="num">
                  <button
                    type="button"
                    className="familier-remove"
                    aria-label={`Retirer ${r.food.name}`}
                    title="Retirer"
                    onClick={() => removeFood(r.food.itemId)}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
