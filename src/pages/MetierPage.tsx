import { useEffect, useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";
import { fetchJobs, fetchJobRecipes, type JobOption } from "../data/dofusApi";
import {
  planRecipesToTarget,
  xpBetween,
  type MetierRecipe,
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
import { loadPrices } from "../lib/storage";
import { setManualPrice, clearPrice } from "../lib/trackedPrices";
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
  const [prices, setPrices] = useState<PriceMap>(() => loadPrices() ?? {});

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
    if (value == null) {
      clearPrice(item.id);
      setPrices((p) => {
        const next = { ...p };
        delete next[item.id];
        return next;
      });
      return;
    }
    setManualPrice(item, value);
    setPrices((p) => ({ ...p, [item.id]: value }));
  }

  const coef = (input.coefPercent || 100) / 100;
  const validRange = input.current < input.target;

  const plans = useMemo(() => {
    if (recipes.length === 0 || !validRange) return [];
    return planRecipesToTarget(recipes, prices, input.current, input.target, coef);
  }, [recipes, prices, input.current, input.target, coef, validRange]);

  // Selected recipe = the one the user picked if still in the list, else the best.
  const selected =
    plans.find((p) => p.recipe.recipeId === selectedId) ?? plans[0];
  const totalXp = validRange ? xpBetween(input.current, input.target) : 0;

  const pct = (lvl: number) => `${Math.min(100, (lvl / MAX_LEVEL) * 100)}%`;

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
        plans.length === 0 && (
          <p className="hint">
            Aucune recette de ce métier n'est craftable au niveau {input.current}.
          </p>
        )}

      {selected && (
        <>
          <div className="metier-tiles">
            <div className="metier-tile">
              <span className="metier-tile-label">Crafts</span>
              <span className="metier-tile-value">{count(selected.crafts)}</span>
              <span className="metier-tile-sub">de « {selected.recipe.result.name} »</span>
            </div>
            <div className="metier-tile">
              <span className="metier-tile-label">XP à gagner</span>
              <span className="metier-tile-value">{count(totalXp)}</span>
              <span className="metier-tile-sub">
                {input.current} → {input.target}
              </span>
            </div>
            <div className="metier-tile accent">
              <span className="metier-tile-label">Coût total</span>
              <span className="metier-tile-value">{formatKamas(selected.cost)}</span>
              <span className="metier-tile-sub">
                {selected.incomplete ? "partiel (prix manquants)" : "aux prix actuels"}
              </span>
            </div>
            <div className="metier-tile">
              <span className="metier-tile-label">Coût moyen</span>
              <span className="metier-tile-value">
                {selected.costPerXp != null ? formatKamas(selected.costPerXp) : "—"}
              </span>
              <span className="metier-tile-sub">kamas / XP</span>
            </div>
          </div>

          <section>
            <h3 className="metier-h3">Choisir une recette</h3>
            <p className="hint metier-h3-sub">
              Cliquez une recette pour voir combien de crafts et de kamas il faut
              pour aller de {input.current} à {input.target}. Triées de la moins
              chère à la plus chère.
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
              {plans.map((plan) => (
                <MetierRecipeRow
                  key={plan.recipe.recipeId}
                  plan={plan}
                  selected={plan.recipe.recipeId === selected.recipe.recipeId}
                  onSelect={() => setSelectedId(plan.recipe.recipeId)}
                />
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3 className="metier-h3">Liste de courses</h3>
            <p className="hint">
              Pour crafter « {selected.recipe.result.name} »{" "}
              {count(selected.crafts)} fois — ce qu'il faut acheter/farmer.
            </p>
            <div className="metier-shopping">
              {selected.shopping.map((ing) => (
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
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
