import { useEffect, useMemo, useState } from "react";
import type { Item } from "../types";
import { fetchJobs, fetchJobRecipes, type JobOption } from "../data/dofusApi";
import {
  planRecipesToTarget,
  buildOptimalPlan,
  xpBetween,
  type MetierRecipe,
  type PlanIngredient,
} from "../lib/metierXp";
import {
  loadMetierInput,
  saveMetierInput,
  loadJobs,
  saveJobs,
  loadJobRecipes,
  saveJobRecipes,
  type MetierInput,
} from "../lib/metierStore";
import { usePrices } from "../lib/usePrices";
import { loadCraftTaxPercent } from "../lib/craftList";
import { formatKamas } from "../lib/format";
import { MetierRecipeRow } from "../components/MetierRecipeRow";
import { PriceInput } from "../components/PriceInput";

type Load = "idle" | "loading" | "error";
const MAX_LEVEL = 200;

/** A plain count/XP with thousands separators, e.g. 3800 -> "3 800". */
function count(value: number | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("fr-FR");
}

/**
 * The Métiers page: pick a job + current/target level, then choose a recipe to
 * see how many crafts (and how much kamas) it takes to reach the target. Recipes
 * are ranked cheapest-first; the top one is picked by default. XP comes from the
 * Dofus level formula (see metierXp.ts); the cost is exact, from the price store.
 */
export function MetierPage() {
  const [input, setInput] = useState<MetierInput>(loadMetierInput);
  const { prices, setPrice, clearPrice } = usePrices();

  const [jobs, setJobs] = useState<JobOption[]>(() => loadJobs() ?? []);
  const [recipes, setRecipes] = useState<MetierRecipe[]>([]);
  const [recipesStatus, setRecipesStatus] = useState<Load>("idle");
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();

  function patchInput(patch: Partial<MetierInput>) {
    setInput((prev) => {
      const next = { ...prev, ...patch };
      saveMetierInput(next);
      return next;
    });
  }

  // Jobs list: fetched once, then cached.
  useEffect(() => {
    if (jobs.length > 0) return;
    const ctrl = new AbortController();
    fetchJobs(ctrl.signal)
      .then((j) => {
        setJobs(j);
        saveJobs(j);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recipes for the selected job (cache first, then fetch).
  useEffect(() => {
    const jobId = input.jobId;
    if (jobId == null) {
      setRecipes([]);
      return;
    }
    const cached = loadJobRecipes(jobId);
    if (cached) {
      setRecipes(cached);
      setRecipesStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    setRecipes([]);
    setRecipesStatus("loading");
    setError(undefined);
    fetchJobRecipes(jobId, ctrl.signal)
      .then((r) => {
        setRecipes(r);
        saveJobRecipes(jobId, r);
        setRecipesStatus("idle");
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setRecipesStatus("error");
      });
    return () => ctrl.abort();
  }, [input.jobId]);

  // Manual price edit → shared store, then mirror to local state (as Avis/Craft).
  function onPriceChange(item: Item, value: number | null) {
    if (value == null) clearPrice(item.id);
    else setPrice(item, value);
  }

  const coef = (input.coefPercent || 100) / 100;
  // HDV sell tax (shared with the Craft tab) applied to resale revenue.
  const taxRate = loadCraftTaxPercent() / 100;
  const validRange = input.current < input.target;

  const plans = useMemo(() => {
    if (recipes.length === 0 || !validRange) return [];
    return planRecipesToTarget(recipes, prices, input.current, input.target, coef, taxRate);
  }, [recipes, prices, input.current, input.target, coef, taxRate, validRange]);

  // The cheapest auto-switching route (uses recipes that unlock along the way).
  const optimal = useMemo(() => {
    if (recipes.length === 0 || !validRange) return null;
    return buildOptimalPlan(recipes, prices, input.current, input.target, coef, taxRate);
  }, [recipes, prices, input.current, input.target, coef, taxRate, validRange]);

  const hasPlan = optimal != null && (optimal.steps.length > 0 || plans.length > 0);
  // Default selection is "optimal"; a fixed pick wins only if still in the list.
  const fixedSelected = plans.find((p) => p.recipe.recipeId === selectedId);
  const isOptimal = !fixedSelected;

  // Price coverage: how many in-range recipes can actually be costed. "Le moins
  // cher" is only truly cheapest among priced recipes, so this is surfaced.
  const inRange = plans.length;
  const pricedCount = plans.filter((p) => p.priced).length;
  const unpricedCount = inRange - pricedCount;

  // Unified view driving the tiles + shopping list, from whichever is selected.
  const view =
    isOptimal && optimal
      ? {
          label: "chemin le moins cher",
          fromLevel: input.current,
          crafts: optimal.totalCrafts,
          xp: optimal.totalXp,
          cost: optimal.totalCost,
          revenue: optimal.totalRevenue,
          netCost: optimal.netCost,
          netCostPerXp: optimal.netCostPerXp,
          incomplete: optimal.incomplete,
          shopping: optimal.shopping,
        }
      : fixedSelected
        ? {
            label: fixedSelected.locked
              ? `« ${fixedSelected.recipe.result.name} » (dès niv ${fixedSelected.startLevel})`
              : `« ${fixedSelected.recipe.result.name} »`,
            fromLevel: fixedSelected.startLevel,
            crafts: fixedSelected.crafts,
            xp: xpBetween(fixedSelected.startLevel, input.target),
            cost: fixedSelected.cost,
            revenue: fixedSelected.revenue,
            netCost: fixedSelected.netCost,
            netCostPerXp: fixedSelected.netCostPerXp,
            incomplete: fixedSelected.incomplete,
            shopping: fixedSelected.shopping,
          }
        : null;

  // The crafted item(s) of the current plan, with their craft counts, so the
  // resale prices can be entered in one place instead of expanding each row.
  const resaleItems = useMemo(() => {
    const map = new Map<string, { item: Item; crafts: number }>();
    if (isOptimal && optimal) {
      for (const s of optimal.steps) {
        const e = map.get(s.recipe.result.id);
        if (e) e.crafts += s.crafts;
        else map.set(s.recipe.result.id, { item: s.recipe.result, crafts: s.crafts });
      }
    } else if (fixedSelected) {
      map.set(fixedSelected.recipe.result.id, {
        item: fixedSelected.recipe.result,
        crafts: fixedSelected.crafts,
      });
    }
    return [...map.values()];
  }, [isOptimal, optimal, fixedSelected]);

  const pct = (lvl: number) => `${Math.min(100, (lvl / MAX_LEVEL) * 100)}%`;

  /** One editable ingredient line (shared by every shopping list). */
  const ingRow = (ing: PlanIngredient) => (
    <div className="metier-ing" key={ing.item.id}>
      <span className="metier-ing-id">
        <span className="metier-ing-icon">
          {ing.item.img ? <img src={ing.item.img} alt="" /> : <span aria-hidden>▪</span>}
        </span>
        <span className="metier-ing-name" title={ing.item.name}>
          {ing.item.name}
        </span>
      </span>
      <span className="metier-ing-qty">{ing.quantity.toLocaleString("fr-FR")}</span>
      <PriceInput
        value={ing.unitPrice}
        needs={ing.unitPrice == null}
        ariaLabel={`Prix unitaire de ${ing.item.name}`}
        onCommit={(v) => onPriceChange(ing.item, v)}
      />
      <span className={`metier-ing-total${ing.subtotal == null ? " missing" : ""}`}>
        {ing.subtotal != null ? formatKamas(ing.subtotal) : "prix ?"}
      </span>
    </div>
  );

  /** A palier's ingredients scaled to its craft count (for the grouped list). */
  const stepShopping = (step: {
    recipe: MetierRecipe;
    crafts: number;
  }): PlanIngredient[] =>
    step.recipe.ingredients.map((ing) => {
      const quantity = ing.quantity * step.crafts;
      const unit = prices[ing.item.id];
      return {
        item: ing.item,
        quantity,
        unitPrice: unit,
        subtotal: unit != null ? unit * quantity : undefined,
      };
    });

  return (
    <main className="metier-page">
      <section className="panel">
        <h2>Métiers</h2>
        <p className="hint">
          Choisissez un métier et vos niveaux, puis une recette : on calcule
          combien de crafts (et combien de kamas) il faut pour atteindre le niveau
          cible. Les recettes sont triées de la moins chère à la plus chère ; la
          meilleure est sélectionnée par défaut. Les prix viennent de vos prix
          suivis (OCR / manuels) ; l'XP suit la formule Dofus.
        </p>

        <div className="metier-controls">
          <div className="metier-field job">
            <label htmlFor="job">Métier</label>
            <select
              id="job"
              value={input.jobId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : undefined;
                const name = jobs.find((j) => j.id === id)?.name;
                setSelectedId(undefined);
                patchInput({ jobId: id, jobName: name });
              }}
            >
              <option value="">— Choisir —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>
          <div className="metier-field lvl">
            <label htmlFor="cur">Niveau actuel</label>
            <input
              id="cur"
              type="number"
              min={1}
              max={MAX_LEVEL}
              value={input.current}
              onChange={(e) =>
                patchInput({ current: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>
          <span className="metier-arrow" aria-hidden>
            →
          </span>
          <div className="metier-field lvl">
            <label htmlFor="tgt">Niveau cible</label>
            <input
              id="tgt"
              type="number"
              min={1}
              max={MAX_LEVEL}
              value={input.target}
              onChange={(e) =>
                patchInput({
                  target: Math.min(MAX_LEVEL, Number(e.target.value) || 1),
                })
              }
            />
          </div>
          <div className="metier-field lvl">
            <label htmlFor="coef">Coeff. XP %</label>
            <input
              id="coef"
              type="number"
              min={100}
              value={input.coefPercent}
              onChange={(e) =>
                patchInput({
                  coefPercent: Math.max(100, Number(e.target.value) || 100),
                })
              }
            />
          </div>
        </div>

        <div className="metier-progress">
          <div className="metier-progress-bar">
            <div
              className="metier-progress-fill"
              style={{ width: pct(input.current) }}
            />
            <div
              className="metier-progress-target"
              style={{ left: pct(input.target) }}
            />
          </div>
          <div className="metier-progress-scale">
            <span>Niv. 1</span>
            <span>
              actuel {input.current} → cible {input.target}
            </span>
            <span>Niv. {MAX_LEVEL}</span>
          </div>
        </div>
      </section>

      {input.jobId == null && (
        <p className="hint">Choisissez un métier pour voir les recettes.</p>
      )}
      {recipesStatus === "loading" && (
        <div className="metier-loading">
          <span className="metier-spinner" aria-hidden />
          <span>Chargement des recettes du métier…</span>
        </div>
      )}
      {recipesStatus === "error" && (
        <p className="hint error-text">Erreur : {error}</p>
      )}
      {recipesStatus === "idle" && input.jobId != null && !validRange && (
        <p className="hint">Le niveau cible doit être supérieur au niveau actuel.</p>
      )}
      {recipesStatus === "idle" &&
        input.jobId != null &&
        validRange &&
        recipes.length > 0 &&
        !hasPlan && (
          <p className="hint">
            Aucune recette de ce métier n'est craftable sur cette plage de niveaux.
          </p>
        )}

      {hasPlan && view && optimal && (
        <>
          <div className="metier-tiles">
            <div className="metier-tile">
              <span className="metier-tile-label">Coût ingrédients</span>
              <span className="metier-tile-value">{formatKamas(view.cost)}</span>
              <span className="metier-tile-sub">{count(view.crafts)} crafts</span>
            </div>
            <div className="metier-tile">
              <span className="metier-tile-label">Revente</span>
              <span className="metier-tile-value">
                {view.revenue > 0 ? `− ${formatKamas(view.revenue)}` : "—"}
              </span>
              <span className="metier-tile-sub">
                revendus{taxRate > 0 ? ` (taxe ${Math.round(taxRate * 100)} %)` : ""}
              </span>
            </div>
            <div className="metier-tile accent">
              <span className="metier-tile-label">Coût net</span>
              <span
                className={`metier-tile-value${view.netCost != null && view.netCost < 0 ? " metier-profit" : ""}`}
              >
                {view.netCost == null
                  ? "—"
                  : view.netCost >= 0
                    ? formatKamas(view.netCost)
                    : `+${formatKamas(-view.netCost)}`}
              </span>
              <span className="metier-tile-sub">
                {view.netCost != null && view.netCost < 0
                  ? "bénéfice en montant !"
                  : view.incomplete
                    ? "partiel (prix manquants)"
                    : "coût − revente"}
              </span>
            </div>
            <div className="metier-tile">
              <span className="metier-tile-label">Coût net / XP</span>
              <span className="metier-tile-value">
                {view.netCostPerXp != null ? formatKamas(view.netCostPerXp) : "—"}
              </span>
              <span className="metier-tile-sub">kamas / XP</span>
            </div>
          </div>

          <section>
            <h3 className="metier-h3">Choisir une recette</h3>
            <p className="hint metier-h3-sub">
              « Le moins cher » enchaîne les recettes et change quand une meilleure
              se débloque. Ou fixez une recette (façon DofusDB) — y compris celles
              qui se débloquent plus haut, pour renseigner leur prix. Sélectionnez
              une recette pour voir/éditer ses prix dans la liste de courses.
            </p>
            <ul className="metier-path">
              <li className="metier-head metier-head-rrow" aria-hidden>
                <span></span>
                <span>Recette</span>
                <span className="num">XP/craft</span>
                <span className="num">Crafts</span>
                <span className="num">Coût</span>
                <span className="num">k/XP</span>
              </li>

              {/* Optimal (auto-switching) row + its palier breakdown. */}
              <li>
                <button
                  type="button"
                  className={`metier-rrow metier-rrow--optimal${isOptimal ? " selected" : ""}`}
                  aria-pressed={isOptimal}
                  onClick={() => setSelectedId(undefined)}
                >
                  <span className="metier-radio" aria-hidden>
                    {isOptimal ? "●" : "○"}
                  </span>
                  <span className="metier-recipe">
                    <span className="metier-thumb">🏆</span>
                    <span className="metier-recipe-text">
                      <span className="metier-recipe-name">Le moins cher</span>
                      <span className="metier-recipe-meta">
                        change de recette au fil des niveaux
                        {optimal.recipeCount > 1 && (
                          <span className="metier-slots">
                            {optimal.recipeCount} recettes
                          </span>
                        )}
                        <span
                          className={`metier-slots${unpricedCount > 0 ? " metier-unpriced" : ""}`}
                        >
                          {pricedCount}/{inRange} chiffrées
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="num metier-xpcraft">—</span>
                  <span className="num metier-crafts">
                    {optimal.totalCrafts.toLocaleString("fr-FR")}
                  </span>
                  <span
                    className={`num metier-cost${optimal.netCost != null && optimal.netCost < 0 ? " metier-profit" : ""}`}
                  >
                    {optimal.netCost == null
                      ? "—"
                      : optimal.netCost >= 0
                        ? formatKamas(optimal.netCost)
                        : `+${formatKamas(-optimal.netCost)}`}
                  </span>
                  <span className="num metier-kxp-cell">
                    <span className="metier-kxp">
                      {optimal.netCostPerXp != null
                        ? `${formatKamas(optimal.netCostPerXp)}/xp`
                        : "—"}
                    </span>
                  </span>
                </button>
                {isOptimal && optimal.steps.length > 0 && (
                  <div className="metier-paliers">
                    <div className="metier-pcap">Étapes du chemin</div>
                    {optimal.steps.map((step, i) => (
                      <div className="metier-pal" key={`${step.fromLevel}-${step.recipe.recipeId}`}>
                        <span className="metier-pband">
                          <strong>
                            Niv {step.fromLevel}–{step.toLevel}
                          </strong>
                        </span>
                        <span className="metier-pname" title={step.recipe.result.name}>
                          <span className="metier-picon">
                            {step.recipe.result.img ? (
                              <img src={step.recipe.result.img} alt="" />
                            ) : (
                              <span aria-hidden>⚒️</span>
                            )}
                          </span>
                          <span className="metier-slots">Niv {step.recipe.resultLevel}</span>
                          {step.recipe.result.name}
                          {i > 0 && (
                            <span className="metier-pswitch"> ↑ débloqué/moins cher</span>
                          )}
                        </span>
                        <span className="metier-pcrafts">
                          {step.crafts.toLocaleString("fr-FR")} crafts
                          {step.netCost != null
                            ? ` · net ${step.netCost >= 0 ? formatKamas(step.netCost) : `+${formatKamas(-step.netCost)}`}`
                            : ""}
                        </span>
                      </div>
                    ))}
                    {unpricedCount > 0 && (
                      <div className="metier-warn">
                        ⚠ {unpricedCount} recette{unpricedCount > 1 ? "s" : ""} sans
                        prix, non comparée{unpricedCount > 1 ? "s" : ""} — l'une
                        pourrait être moins chère. Renseignez leur prix (marquées «
                        prix ? » ci-dessous) pour en être sûr.
                      </div>
                    )}
                  </div>
                )}
              </li>

              {plans.map((plan) => (
                <MetierRecipeRow
                  key={plan.recipe.recipeId}
                  plan={plan}
                  selected={!isOptimal && plan.recipe.recipeId === selectedId}
                  prices={prices}
                  onSelect={() => setSelectedId(plan.recipe.recipeId)}
                  onPriceChange={onPriceChange}
                />
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3 className="metier-h3">Liste de courses</h3>
            <p className="hint">
              {isOptimal
                ? "Une section par étape du chemin — vérifiez chaque objet et ajustez les prix (partagés avec les autres pages)."
                : `Pour le ${view.label} — ${count(view.crafts)} crafts — ce qu'il faut acheter/farmer.`}
            </p>

            {isOptimal ? (
              optimal.steps.map((step) => (
                <div
                  className="metier-shop-group"
                  key={`${step.fromLevel}-${step.recipe.recipeId}`}
                >
                  <div className="metier-shop-head">
                    <span className="metier-ing-icon">
                      {step.recipe.result.img ? (
                        <img src={step.recipe.result.img} alt="" />
                      ) : (
                        <span aria-hidden>⚒️</span>
                      )}
                    </span>
                    <span className="metier-shop-title" title={step.recipe.result.name}>
                      {step.recipe.result.name}
                    </span>
                    <span className="metier-shop-meta">
                      Niv {step.fromLevel}–{step.toLevel} ·{" "}
                      {step.crafts.toLocaleString("fr-FR")} crafts
                      {step.cost != null ? ` · ${formatKamas(step.cost)}` : ""}
                    </span>
                  </div>
                  <div className="metier-shopping">
                    {stepShopping(step).map(ingRow)}
                  </div>
                </div>
              ))
            ) : (
              <div className="metier-shopping">{view.shopping.map(ingRow)}</div>
            )}
          </section>

          {resaleItems.length > 0 && (
            <section className="panel">
              <h3 className="metier-h3">Revente des objets craftés</h3>
              <p className="hint">
                Prix de vente de ce que vous craftez — déduit du coût net
                {taxRate > 0 ? ` (taxe HDV ${Math.round(taxRate * 100)} % appliquée)` : ""}.
                Partagé avec les autres pages.
              </p>
              <div className="metier-shopping">
                {resaleItems.map(({ item, crafts }) => {
                  const unit = prices[item.id];
                  const revenue = unit != null ? unit * (1 - taxRate) * crafts : undefined;
                  return (
                    <div className="metier-ing metier-ing--revenue" key={item.id}>
                      <span className="metier-ing-id">
                        <span className="metier-ing-icon">
                          {item.img ? (
                            <img src={item.img} alt="" />
                          ) : (
                            <span aria-hidden>⚒️</span>
                          )}
                        </span>
                        <span className="metier-ing-name" title={item.name}>
                          {item.name}
                        </span>
                      </span>
                      <span className="metier-ing-qty">
                        ×{crafts.toLocaleString("fr-FR")}
                      </span>
                      <PriceInput
                        value={unit}
                        needs={unit == null}
                        ariaLabel={`Prix de revente de ${item.name}`}
                        onCommit={(v) => onPriceChange(item, v)}
                      />
                      <span
                        className={`metier-ing-total${revenue == null ? " missing" : " metier-profit"}`}
                      >
                        {revenue != null ? `− ${formatKamas(revenue)}` : "à saisir"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
