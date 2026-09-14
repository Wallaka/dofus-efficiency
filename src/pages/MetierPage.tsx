import { useEffect, useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";
import { fetchJobs, fetchJobRecipes, type JobOption } from "../data/dofusApi";
import { buildLevelingPlan, type MetierRecipe } from "../lib/metierXp";
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
import { loadPriceEntries, type PriceEntryMap } from "../lib/priceStore";
import { setManualPrice, clearPrice } from "../lib/trackedPrices";
import { formatKamas } from "../lib/format";
import { MetierStepRow } from "../components/MetierStepRow";
import { PriceInput } from "../components/PriceInput";

type Load = "idle" | "loading" | "error";
const MAX_LEVEL = 200;

/** Compact kamas for the big tiles, e.g. 5 430 000 -> "5,4 M". */
function short(value: number | undefined): string {
  if (value == null) return "—";
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (value >= 1_000)
    return `${(value / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k`;
  return Math.round(value).toLocaleString("fr-FR");
}

/**
 * The Métiers page: pick a job + current/target level and get the cheapest
 * leveling path (crafts, cost, shopping list), priced from the shared store.
 * XP comes from the Dofus level formula (see metierXp.ts); the cost is exact.
 */
export function MetierPage() {
  const [input, setInput] = useState<MetierInput>(loadMetierInput);
  const [prices, setPrices] = useState<PriceMap>(() => loadPrices() ?? {});
  const [priceEntries, setPriceEntries] =
    useState<PriceEntryMap>(loadPriceEntries);

  const [jobs, setJobs] = useState<JobOption[]>(() => loadJobs() ?? []);
  const [recipes, setRecipes] = useState<MetierRecipe[]>([]);
  const [recipesStatus, setRecipesStatus] = useState<Load>("idle");
  const [error, setError] = useState<string>();

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
      setPriceEntries((e) => {
        const next = { ...e };
        delete next[item.id];
        return next;
      });
      return;
    }
    const entry = setManualPrice(item, value);
    setPrices((p) => ({ ...p, [item.id]: value }));
    setPriceEntries((e) => ({ ...e, [item.id]: entry }));
  }

  const coef = (input.coefPercent || 100) / 100;

  const plan = useMemo(() => {
    if (recipes.length === 0 || input.current >= input.target) return null;
    return buildLevelingPlan(
      recipes,
      prices,
      input.current,
      input.target,
      coef,
    );
  }, [recipes, prices, input.current, input.target, coef]);

  const pct = (lvl: number) => `${Math.min(100, (lvl / MAX_LEVEL) * 100)}%`;

  return (
    <main className="metier-page">
      <section className="panel">
        <h2>Métiers</h2>
        <p className="hint">
          Choisissez un métier et vos niveaux : on calcule le chemin de leveling
          le moins cher, avec le nombre de crafts, la liste de courses et le coût
          — d'après vos prix suivis (OCR / manuels). L'XP par craft suit la
          formule Dofus (20 × niveau de la recette, moins un malus d'écart de
          niveau) ; le coût, lui, vient de vos vrais prix.
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
        <p className="hint">Choisissez un métier pour voir le chemin de leveling.</p>
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
      {recipesStatus === "idle" &&
        input.jobId != null &&
        input.current >= input.target && (
          <p className="hint">Le niveau cible doit être supérieur au niveau actuel.</p>
        )}

      {plan && plan.steps.length > 0 && (
        <>
          <div className="metier-tiles">
            <div className="metier-tile">
              <span className="metier-tile-label">Crafts</span>
              <span className="metier-tile-value">{short(plan.totalCrafts)}</span>
              <span className="metier-tile-sub">réussis, au total</span>
            </div>
            <div className="metier-tile">
              <span className="metier-tile-label">XP à gagner</span>
              <span className="metier-tile-value">{short(plan.totalXp)}</span>
              <span className="metier-tile-sub">
                {input.current} → {input.target}
              </span>
            </div>
            <div className="metier-tile accent">
              <span className="metier-tile-label">Coût total</span>
              <span className="metier-tile-value">
                {plan.totalCost != null ? `${short(plan.totalCost)} k` : "—"}
              </span>
              <span className="metier-tile-sub">
                {plan.incomplete ? "partiel (prix manquants)" : "aux prix actuels"}
              </span>
            </div>
            <div className="metier-tile">
              <span className="metier-tile-label">Coût moyen</span>
              <span className="metier-tile-value">
                {plan.avgCostPerXp != null ? short(plan.avgCostPerXp) : "—"}
              </span>
              <span className="metier-tile-sub">kamas / XP</span>
            </div>
          </div>

          <section>
            <h3 className="metier-h3">Chemin de leveling</h3>
            <p className="hint metier-h3-sub">
              À chaque palier de niveaux, craftez la recette indiquée le nombre de
              fois affiché — c'est le plus rentable (kamas/XP) pour aller de{" "}
              {input.current} à {input.target}. Cliquez une ligne pour la liste de
              courses de ce palier.
            </p>
            <ul className="metier-path">
              <li className="metier-head" aria-hidden>
                <span></span>
                <span>Palier</span>
                <span>Recette à spammer</span>
                <span className="num">XP/craft</span>
                <span className="num">Crafts</span>
                <span className="num">Coût</span>
                <span className="num">k/XP</span>
              </li>
              {plan.steps.map((step) => (
                <MetierStepRow
                  key={`${step.fromLevel}-${step.recipe.recipeId}`}
                  step={step}
                  entries={priceEntries}
                  onPriceChange={onPriceChange}
                />
              ))}
            </ul>
            {plan.stuckAtLevel != null && (
              <p className="hint">
                Aucune recette de ce métier n'est craftable au niveau{" "}
                {plan.stuckAtLevel} ; le chemin s'arrête là.
              </p>
            )}
          </section>

          <section className="panel">
            <h3 className="metier-h3">Liste de courses totale</h3>
            <p className="hint">
              Toutes les ressources des paliers cumulées — ce qu'il faut
              acheter/farmer en tout.
            </p>
            <div className="metier-shopping">
              {plan.shopping.map((ing) => (
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

      {recipesStatus === "idle" &&
        input.jobId != null &&
        recipes.length > 0 &&
        plan != null &&
        plan.steps.length === 0 && (
          <p className="hint">Aucune recette exploitable pour ce métier.</p>
        )}
    </main>
  );
}
