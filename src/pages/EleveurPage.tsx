import { useEffect, useMemo, useState } from "react";
import {
  computeEleveur,
  defaultEleveurInput,
  slotsForLevel,
  lineCost,
  isMissingPrice,
  isMissingOutputPrice,
  outputExpectedQty,
  newBreakpoint,
  newCostLine,
  newItemCostLine,
  newOutputLine,
  type CostLine,
  type EleveurInput,
  type LevelBreakpoint,
  type OutputLine,
} from "../lib/eleveur";
import { filetsForLevel, filetById, type FiletDef } from "../lib/filets";
import { MOUNTS, mountById, brisageFor } from "../lib/mounts";
import type { Item } from "../types";
import { loadEleveur, saveEleveur } from "../lib/storage";
import { usePrices } from "../lib/usePrices";
import { useFavourites } from "../lib/useFavourites";
import { loadCraftTaxPercent } from "../lib/craftList";
import { formatKamas, formatKamasSigned, formatPercent } from "../lib/format";
import { ItemAutocomplete } from "../components/ItemAutocomplete";

/** Colour a range: green if even the worst case is positive, red if the best is negative. */
function rangeProfitClass(a: number | undefined, b: number | undefined): string {
  if (a == null || b == null) return "";
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo > 0) return "positive";
  if (hi < 0) return "negative";
  return "";
}

/** Format two endpoints as "lo – hi" (single value when they coincide). */
function fmtRange(
  a: number | undefined,
  b: number | undefined,
  fmt: (n: number | undefined) => string,
): string {
  if (a == null || b == null) return "—";
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.round(lo) === Math.round(hi)
    ? fmt(lo)
    : `${fmt(lo)} – ${fmt(hi)}`;
}

/** A plain integer-ish count with thousands separators. */
function count(value: number | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("fr-FR");
}

/** Parse a number input, keeping "" as undefined and rejecting negatives. */
function num(v: string): number | undefined {
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Éleveur page: the "brisage" money-making loop.
 *
 * Capture wild dragodindes (filtres) → raise them across your enclos (food +
 * days) → break them into runes → sell. Your éleveur level sets how many enclos
 * and mounts you can run at once, via an editable breakpoint table. Prices
 * (filtre, food, runes) come from the shared store, so edits here show up on the
 * Prix/Suivis pages and export too.
 */
export function EleveurPage() {
  const [input, setInput] = useState<EleveurInput>(
    () => loadEleveur() ?? defaultEleveurInput(),
  );
  const { prices, setPrice, clearPrice } = usePrices();
  const { favourites } = useFavourites();

  useEffect(() => {
    saveEleveur(input);
  }, [input]);

  const taxRate = loadCraftTaxPercent() / 100;
  // Mounts-per-capture is a range for the variable filets, so we evaluate both
  // bounds: `low` = fewest mounts (worst case, most filet cost, least profit),
  // `high` = most mounts (best case). When the filet is deterministic the two
  // coincide and the UI shows a single figure.
  const mMin = input.mountsPerCaptureMin ?? 1;
  const mMax = input.mountsPerCaptureMax ?? mMin;
  const low = useMemo(
    () => computeEleveur(input, prices, taxRate, mMin),
    [input, prices, taxRate, mMin],
  );
  const high = useMemo(
    () => computeEleveur(input, prices, taxRate, mMax),
    [input, prices, taxRate, mMax],
  );
  // `result` (high case) still drives the fixed figures unaffected by the range.
  const result = high;

  const outputIds = useMemo(
    () => new Set(input.outputs.map((o) => o.itemId)),
    [input.outputs],
  );
  const foodIds = useMemo(
    () => new Set(input.raiseCosts.map((c) => c.itemId).filter(Boolean) as string[]),
    [input.raiseCosts],
  );

  const derived = slotsForLevel(input.level, input.breakpoints);
  const usingOverride =
    input.enclosOverride != null || input.capacityOverride != null;

  // The breakpoint currently in effect: the highest-level row you've reached.
  const activeBreakpointLevel = useMemo(() => {
    const lvl = input.level ?? 0;
    const reached = input.breakpoints
      .filter((b) => b.level <= lvl)
      .map((b) => b.level);
    return reached.length ? Math.max(...reached) : null;
  }, [input.breakpoints, input.level]);

  function patch(p: Partial<EleveurInput>) {
    setInput((prev) => ({ ...prev, ...p }));
  }

  // ---- shared-store price helpers (mirror the craft/métier pages) ----
  function setItemPrice(item: Item, v: string) {
    const n = num(v);
    if (n == null) clearPrice(item.id);
    else setPrice(item, n);
  }

  // ---- mount to raise (top selector) ----
  function selectMount(id: string) {
    const m = mountById(id);
    if (!m) {
      patch({
        mountId: undefined,
        mountLabel: undefined,
        mountImg: undefined,
        mountCreature: undefined,
      });
      return;
    }
    // Picking a mount seeds its brisage runes as output lines, and drops any
    // chosen filet that no longer fits the new creature (universal net stays).
    const runes = brisageFor(m.id).map((r) => ({
      ...newOutputLine({ id: r.itemId, name: r.label, img: r.img }),
      chance: r.chance,
      quantityMin: r.quantityMin,
      quantityMax: r.quantityMax,
    }));
    const currentFilet = filetById(input.filtreItemId);
    const keepFilet =
      currentFilet != null &&
      (currentFilet.creature === "Universel" || currentFilet.creature === m.creature);
    patch({
      mountId: m.id,
      mountLabel: m.name,
      mountImg: m.img,
      mountCreature: m.creature,
      outputs: runes,
      ...(keepFilet
        ? {}
        : {
            filtreItemId: undefined,
            filtreLabel: undefined,
            filtreImg: undefined,
          }),
    });
  }

  // ---- capture filet (level-filtered dropdown) ----
  function selectFiltre(def: FiletDef) {
    // Picking a filet also seeds its (editable) mounts-per-capture range.
    patch({
      filtreItemId: def.id,
      filtreLabel: def.name,
      filtreImg: def.img,
      mountsPerCaptureMin: def.mountsMin,
      mountsPerCaptureMax: def.mountsMax,
    });
  }

  // ---- breakpoint table ----
  function updateBreakpoint(id: string, p: Partial<LevelBreakpoint>) {
    patch({
      breakpoints: input.breakpoints.map((b) =>
        b.id === id ? { ...b, ...p } : b,
      ),
    });
  }
  function addBreakpoint() {
    const last = input.breakpoints[input.breakpoints.length - 1];
    patch({
      breakpoints: [
        ...input.breakpoints,
        newBreakpoint(
          (last?.level ?? 0) + 10,
          last?.enclos ?? 1,
          last?.capacity ?? 1,
        ),
      ],
    });
  }
  function removeBreakpoint(id: string) {
    patch({ breakpoints: input.breakpoints.filter((b) => b.id !== id) });
  }

  // ---- raising costs ----
  function updateCost(id: string, p: Partial<CostLine>) {
    patch({
      raiseCosts: input.raiseCosts.map((c) => (c.id === id ? { ...c, ...p } : c)),
    });
  }
  function addManualCost() {
    patch({ raiseCosts: [...input.raiseCosts, newCostLine()] });
  }
  function addFoodItem(item: Item) {
    if (foodIds.has(item.id)) return;
    patch({ raiseCosts: [...input.raiseCosts, newItemCostLine(item)] });
  }
  function removeCost(id: string) {
    patch({ raiseCosts: input.raiseCosts.filter((c) => c.id !== id) });
  }

  // ---- rune outputs ----
  function updateOutput(id: string, p: Partial<OutputLine>) {
    patch({
      outputs: input.outputs.map((o) => (o.id === id ? { ...o, ...p } : o)),
    });
  }
  function addOutput(item: Item) {
    if (outputIds.has(item.id)) return;
    patch({ outputs: [...input.outputs, newOutputLine(item)] });
  }
  function removeOutput(id: string) {
    patch({ outputs: input.outputs.filter((o) => o.id !== id) });
  }

  function reset() {
    setInput(defaultEleveurInput());
  }

  const filtrePrice =
    input.filtreItemId != null ? prices[input.filtreItemId] : undefined;

  // Filets usable at the current level, plus the chosen one if it's above level
  // (kept in the list but flagged, rather than silently dropped).
  const availableFilets = useMemo(
    () => filetsForLevel(input.level, input.mountCreature),
    [input.level, input.mountCreature],
  );
  const selectedFilet = filetById(input.filtreItemId);
  const filetOptions = useMemo(() => {
    if (selectedFilet && !availableFilets.some((f) => f.id === selectedFilet.id)) {
      return [selectedFilet, ...availableFilets];
    }
    return availableFilets;
  }, [availableFilets, selectedFilet]);
  const selectedBelowLevel =
    selectedFilet != null && selectedFilet.level > (input.level ?? 0);

  return (
    <main className="eleveur-page">
      {/* ---------------- Mount selector ---------------- */}
      <section className="panel">
        <h2>Monture à élever</h2>
        <p className="hint">
          Choisissez la monture sauvage à capturer, élever dans vos enclos, puis
          briser. Elle déterminera les filets adaptés et les runes du brisage.
        </p>
        <div className="eleveur-mount">
          {input.mountImg && (
            <img src={input.mountImg} alt="" className="eleveur-mount-icon" />
          )}
          <select
            aria-label="Monture à élever"
            value={input.mountId ?? ""}
            onChange={(e) => selectMount(e.target.value)}
          >
            <option value="">— Choisir une monture —</option>
            {MOUNTS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.creature})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ---------------- Results dashboard ---------------- */}
      <section className="panel">
        <h2>Rentabilité du brisage</h2>
        <p className="hint">
          Capturer des dragodindes (filtres) → les élever dans vos enclos
          (nourriture + jours) → les briser en runes → revendre. Tout est chiffré
          depuis vos prix suivis (OCR / manuels) ; la taxe HDV ({Math.round(taxRate * 100)}
          &nbsp;%) s'applique à la revente des runes.
        </p>

        <div className="eleveur-tiles">
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Capacité</span>
            <span className="eleveur-tile-value">{result.totalSlots}</span>
            <span className="eleveur-tile-sub">
              {result.enclos} enclos × {result.capacity} montures
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Coût / monture</span>
            <span className="eleveur-tile-value">
              {fmtRange(high.costPerMount, low.costPerMount, formatKamas)}
            </span>
            <span className="eleveur-tile-sub">
              filtres {fmtRange(high.captureCostPerMount, low.captureCostPerMount, formatKamas)}{" "}
              + élevage {formatKamas(result.raiseCostPerMount)}
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Runes / monture</span>
            <span className="eleveur-tile-value">
              {formatKamas(result.netRevenuePerMount)}
            </span>
            <span className="eleveur-tile-sub">
              {result.taxPerMount > 0
                ? `brut ${formatKamas(result.grossRevenuePerMount)} − taxe`
                : "après taxe HDV"}
            </span>
          </div>
          <div className="eleveur-tile accent">
            <span className="eleveur-tile-label">Bénéfice / monture</span>
            <span
              className={`eleveur-tile-value ${rangeProfitClass(low.profitPerMount, high.profitPerMount)}`}
            >
              {fmtRange(low.profitPerMount, high.profitPerMount, formatKamasSigned)}
            </span>
            <span className="eleveur-tile-sub">
              marge {fmtRange(low.marginRatio, high.marginRatio, formatPercent)}
            </span>
          </div>
        </div>

        <div className="eleveur-tiles">
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Filtres / rotation</span>
            <span className="eleveur-tile-value">
              {fmtRange(high.filtresPerCycle, low.filtresPerCycle, count)}
            </span>
            <span className="eleveur-tile-sub">
              {fmtRange(high.filtresCostPerCycle, low.filtresCostPerCycle, formatKamas)} de
              filtres
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Bénéfice / rotation</span>
            <span
              className={`eleveur-tile-value ${rangeProfitClass(low.profitPerCycle, high.profitPerCycle)}`}
            >
              {fmtRange(low.profitPerCycle, high.profitPerCycle, formatKamasSigned)}
            </span>
            <span className="eleveur-tile-sub">
              {result.totalSlots} montures brisées
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Bénéfice / jour</span>
            <span
              className={`eleveur-tile-value ${rangeProfitClass(low.profitPerDay, high.profitPerDay)}`}
            >
              {low.profitPerDay == null
                ? "—"
                : fmtRange(low.profitPerDay, high.profitPerDay, formatKamasSigned)}
            </span>
            <span className="eleveur-tile-sub">
              {input.raiseDays ? `sur ${input.raiseDays} j d'élevage` : "durée non saisie"}
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">À renseigner</span>
            <span className="eleveur-tile-value">
              {result.missingPriceItemIds.length}
            </span>
            <span className="eleveur-tile-sub">
              {result.missingPriceItemIds.length === 0
                ? "tous les prix connus"
                : "prix manquants ci-dessous"}
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- Niveau & enclos ---------------- */}
      <section className="panel">
        <h2>Niveau d'éleveur & enclos</h2>
        <p className="hint">
          Votre niveau d'éleveur débloque un nombre d'enclos et de montures par
          enclos. Saisissez les paliers que vous connaissez : la capacité en
          découle. Vous pouvez aussi forcer les valeurs à la main.
        </p>

        <div className="eleveur-level-row">
          <div className="field">
            <label htmlFor="level">Niveau d'éleveur</label>
            <input
              id="level"
              type="number"
              min={1}
              max={200}
              inputMode="numeric"
              value={input.level ?? ""}
              onChange={(e) => patch({ level: num(e.target.value) })}
            />
          </div>
          <div className="eleveur-derived">
            <span>
              D'après le tableau :{" "}
              <strong>
                {derived.enclos} enclos × {derived.capacity} montures ={" "}
                {derived.enclos * derived.capacity}
              </strong>
            </span>
          </div>
        </div>

        <table className="eleveur-bp">
          <thead>
            <tr>
              <th>Dès le niveau</th>
              <th>Enclos</th>
              <th>Montures / enclos</th>
              <th aria-label="Retirer"></th>
            </tr>
          </thead>
          <tbody>
            {input.breakpoints.map((bp) => {
              const active = bp.level === activeBreakpointLevel;
              return (
                <tr key={bp.id} className={active ? "active" : ""}>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={bp.level}
                      onChange={(e) =>
                        updateBreakpoint(bp.id, { level: Number(e.target.value) || 0 })
                      }
                      aria-label="Niveau du palier"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={bp.enclos}
                      onChange={(e) =>
                        updateBreakpoint(bp.id, { enclos: Number(e.target.value) || 0 })
                      }
                      aria-label="Nombre d'enclos"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={bp.capacity}
                      onChange={(e) =>
                        updateBreakpoint(bp.id, { capacity: Number(e.target.value) || 0 })
                      }
                      aria-label="Montures par enclos"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cost-remove"
                      onClick={() => removeBreakpoint(bp.id)}
                      aria-label={`Retirer le palier niveau ${bp.level}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="cost-actions">
          <button type="button" onClick={addBreakpoint}>
            + Ajouter un palier
          </button>
          <button type="button" className="ghost" onClick={reset}>
            Réinitialiser la page
          </button>
        </div>

        <div className="eleveur-override">
          <label>
            <input
              type="checkbox"
              checked={usingOverride}
              onChange={(e) =>
                patch(
                  e.target.checked
                    ? {
                        enclosOverride: derived.enclos,
                        capacityOverride: derived.capacity,
                      }
                    : { enclosOverride: undefined, capacityOverride: undefined },
                )
              }
            />{" "}
            Forcer enclos / capacité (ignore le tableau)
          </label>
          {usingOverride && (
            <div className="eleveur-override-fields">
              <div className="field">
                <label htmlFor="enc-ov">Enclos</label>
                <input
                  id="enc-ov"
                  type="number"
                  min={0}
                  value={input.enclosOverride ?? ""}
                  onChange={(e) => patch({ enclosOverride: num(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="cap-ov">Montures / enclos</label>
                <input
                  id="cap-ov"
                  type="number"
                  min={0}
                  value={input.capacityOverride ?? ""}
                  onChange={(e) => patch({ capacityOverride: num(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Capture ---------------- */}
      <section className="panel">
        <h2>Capture</h2>
        <p className="hint">
          Le filet de capture (les filets ont un niveau d'éleveur requis — seuls
          ceux que votre niveau permet sont proposés), combien il en faut par
          capture, et combien de montures il rapporte. Prix partagé avec vos prix
          suivis.
        </p>

        <div className="eleveur-capture">
          <div className="field eleveur-filet-select">
            <label htmlFor="filet">Filet</label>
            <div className="eleveur-filet-picker">
              {input.filtreImg && (
                <img src={input.filtreImg} alt="" className="eleveur-out-icon" />
              )}
              <select
                id="filet"
                value={input.filtreItemId ?? ""}
                onChange={(e) => {
                  const def = filetById(e.target.value);
                  if (def) selectFiltre(def);
                  else
                    patch({
                      filtreItemId: undefined,
                      filtreLabel: undefined,
                      filtreImg: undefined,
                    });
                }}
              >
                <option value="">— Choisir —</option>
                {filetOptions.map((f) => (
                  <option
                    key={f.id}
                    value={f.id}
                    disabled={f.level > (input.level ?? 0)}
                  >
                    {f.name} — niv {f.level}
                    {f.creature !== "Universel" ? ` · ${f.creature}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field eleveur-num">
            <label htmlFor="filtres">Filets / capture</label>
            <input
              id="filtres"
              type="number"
              min={0}
              inputMode="numeric"
              value={input.captureFiltres ?? ""}
              onChange={(e) => patch({ captureFiltres: num(e.target.value) })}
            />
          </div>
          <div className="field eleveur-num eleveur-num-range">
            <label htmlFor="mpc-min">Montures / capture</label>
            <div className="eleveur-range-inputs">
              <input
                id="mpc-min"
                type="number"
                min={1}
                inputMode="numeric"
                aria-label="Montures par capture (min)"
                value={input.mountsPerCaptureMin ?? ""}
                onChange={(e) => patch({ mountsPerCaptureMin: num(e.target.value) })}
              />
              <span className="cost-x">à</span>
              <input
                id="mpc-max"
                type="number"
                min={1}
                inputMode="numeric"
                aria-label="Montures par capture (max)"
                value={input.mountsPerCaptureMax ?? ""}
                onChange={(e) => patch({ mountsPerCaptureMax: num(e.target.value) })}
              />
            </div>
            <p className="hint">
              Fourchette du filet (min–max), modifiable.
            </p>
          </div>
          <div className="field eleveur-num">
            <label htmlFor="filtre-price">Prix du filet</label>
            <input
              id="filtre-price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="prix ?"
              disabled={input.filtreItemId == null}
              className={
                input.filtreItemId != null && filtrePrice == null ? "needs-price" : ""
              }
              value={filtrePrice ?? ""}
              onChange={(e) =>
                input.filtreItemId != null &&
                setItemPrice(
                  {
                    id: input.filtreItemId,
                    name: input.filtreLabel ?? "Filet",
                    img: input.filtreImg,
                  },
                  e.target.value,
                )
              }
            />
          </div>
          <div className="eleveur-capture-total">
            <span className="eleveur-tile-label">Coût capture / monture</span>
            <strong>{formatKamas(result.captureCostPerMount)}</strong>
          </div>
        </div>

        {selectedBelowLevel && selectedFilet && (
          <p className="hint error-text">
            ⚠ « {selectedFilet.name} » demande le niveau {selectedFilet.level} —
            au-dessus de votre niveau actuel.
          </p>
        )}
        {availableFilets.length === 0 && (
          <p className="hint">Aucun filet disponible à votre niveau d'éleveur.</p>
        )}
      </section>

      {/* ---------------- Élevage ---------------- */}
      <section className="panel">
        <h2>Élevage</h2>
        <p className="hint">
          Durée d'élevage avant brisage, et les coûts par monture (nourriture,
          divers). Un objet suivi est chiffré prix × quantité.
        </p>
        <div className="field eleveur-days">
          <label htmlFor="days">Durée d'élevage (jours)</label>
          <input
            id="days"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="—"
            value={input.raiseDays ?? ""}
            onChange={(e) => patch({ raiseDays: num(e.target.value) })}
          />
          <p className="hint">Sert au bénéfice par jour.</p>
        </div>

        <ul className="cost-list">
          {input.raiseCosts.map((cost) =>
            cost.itemId != null ? (
              <li key={cost.id} className="cost-row item">
                <span className="cost-item-name">{cost.label}</span>
                <input
                  type="number"
                  className="cost-qty"
                  min={0}
                  inputMode="numeric"
                  placeholder="Qté"
                  value={cost.quantity ?? ""}
                  onChange={(e) =>
                    updateCost(cost.id, { quantity: num(e.target.value) })
                  }
                  aria-label={`Quantité de ${cost.label}`}
                />
                <span className="cost-x">×</span>
                <input
                  type="number"
                  className="cost-unit"
                  min={0}
                  inputMode="numeric"
                  placeholder="prix"
                  value={prices[cost.itemId] ?? ""}
                  onChange={(e) =>
                    setItemPrice({ id: cost.itemId!, name: cost.label }, e.target.value)
                  }
                  aria-label={`Prix unitaire de ${cost.label}`}
                />
                <span
                  className={`cost-line-total ${
                    isMissingPrice(cost, prices) ? "missing" : ""
                  }`}
                >
                  {isMissingPrice(cost, prices)
                    ? "prix ?"
                    : formatKamas(lineCost(cost, prices))}
                </span>
                <button
                  type="button"
                  className="cost-remove"
                  onClick={() => removeCost(cost.id)}
                  aria-label={`Retirer ${cost.label}`}
                >
                  ✕
                </button>
              </li>
            ) : (
              <li key={cost.id} className="cost-row">
                <input
                  type="text"
                  className="cost-label"
                  placeholder="Poste de coût"
                  value={cost.label}
                  onChange={(e) => updateCost(cost.id, { label: e.target.value })}
                  aria-label="Nom du coût"
                />
                <input
                  type="number"
                  className="cost-amount"
                  min={0}
                  inputMode="numeric"
                  placeholder="—"
                  value={cost.amount ?? ""}
                  onChange={(e) => updateCost(cost.id, { amount: num(e.target.value) })}
                  aria-label="Montant en kamas"
                />
                <button
                  type="button"
                  className="cost-remove"
                  onClick={() => removeCost(cost.id)}
                  aria-label={`Retirer ${cost.label || "ce coût"}`}
                >
                  ✕
                </button>
              </li>
            ),
          )}
        </ul>

        <div className="cost-actions">
          <button type="button" onClick={addManualCost}>
            + Ajouter un coût
          </button>
        </div>

        <div className="cost-items">
          <p className="hint">Ajouter un objet suivi (nourriture) comme coût :</p>
          {favourites.length > 0 && (
            <div className="fav-chips">
              {favourites.map((fav) => (
                <button
                  type="button"
                  key={fav.id}
                  className="fav-chip"
                  onClick={() => addFoodItem(fav)}
                  disabled={foodIds.has(fav.id)}
                  title={foodIds.has(fav.id) ? "Déjà ajouté" : "Ajouter comme coût"}
                >
                  {fav.name}
                </button>
              ))}
            </div>
          )}
          <ItemAutocomplete
            onPick={addFoodItem}
            isPicked={(id) => foodIds.has(id)}
            placeholder="Rechercher un objet à ajouter…"
          />
        </div>
      </section>

      {/* ---------------- Brisage (runes) ---------------- */}
      <section className="panel">
        <h2>Brisage — runes obtenues</h2>
        <p className="hint">
          {input.mountLabel
            ? `Runes du brisage d'un ${input.mountLabel} (pré-remplies) — ajustez proba et quantités si besoin. `
            : "Choisissez une monture en haut pour pré-remplir ses runes, ou ajoutez-les à la main. "}
          Brisage aléatoire : proba d'obtention × quantité (min–max). Le total est
          l'espérance par monture (proba × quantité moyenne × prix). Prix partagés
          avec vos prix suivis.
        </p>

        {input.outputs.length === 0 ? (
          <p className="hint eleveur-empty">
            {input.mountId
              ? "Aucune rune connue pour cette monture — ajoutez-les ci-dessous."
              : "Sélectionnez une monture en haut, ou ajoutez les runes à la main."}
          </p>
        ) : (
          <ul className="cost-list">
            {input.outputs.map((out) => {
              const exp = outputExpectedQty(out);
              const unit = prices[out.itemId];
              return (
                <li key={out.id} className="cost-row item eleveur-rune-row">
                  <span className="cost-item-name">
                    {out.img && (
                      <img src={out.img} alt="" className="eleveur-out-icon" />
                    )}
                    {out.label}
                  </span>
                  <label className="eleveur-rune-field">
                    <span>proba</span>
                    <input
                      type="number"
                      className="eleveur-rune-pct"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      value={out.chance != null ? Math.round(out.chance * 100) : ""}
                      onChange={(e) => {
                        const v = num(e.target.value);
                        updateOutput(out.id, {
                          chance: v == null ? undefined : Math.min(1, v / 100),
                        });
                      }}
                      aria-label={`Probabilité d'obtenir ${out.label} (%)`}
                    />
                    <span className="eleveur-rune-suffix">%</span>
                  </label>
                  <label className="eleveur-rune-field">
                    <span>qté</span>
                    <input
                      type="number"
                      className="eleveur-rune-qty"
                      min={0}
                      inputMode="decimal"
                      placeholder="min"
                      value={out.quantityMin ?? ""}
                      onChange={(e) =>
                        updateOutput(out.id, { quantityMin: num(e.target.value) })
                      }
                      aria-label={`Quantité min de ${out.label}`}
                    />
                    <span className="cost-x">à</span>
                    <input
                      type="number"
                      className="eleveur-rune-qty"
                      min={0}
                      inputMode="decimal"
                      placeholder="max"
                      value={out.quantityMax ?? ""}
                      onChange={(e) =>
                        updateOutput(out.id, { quantityMax: num(e.target.value) })
                      }
                      aria-label={`Quantité max de ${out.label}`}
                    />
                  </label>
                  <input
                    type="number"
                    className="cost-unit"
                    min={0}
                    inputMode="numeric"
                    placeholder="prix"
                    value={unit ?? ""}
                    onChange={(e) =>
                      setItemPrice(
                        { id: out.itemId, name: out.label, img: out.img },
                        e.target.value,
                      )
                    }
                    aria-label={`Prix unitaire de ${out.label}`}
                  />
                  <span
                    className={`cost-line-total ${
                      isMissingOutputPrice(out, prices) ? "missing" : "positive"
                    }`}
                    title={`≈ ${exp.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} / monture`}
                  >
                    {isMissingOutputPrice(out, prices)
                      ? "prix ?"
                      : formatKamas((unit ?? 0) * exp)}
                  </span>
                  <button
                    type="button"
                    className="cost-remove"
                    onClick={() => removeOutput(out.id)}
                    aria-label={`Retirer ${out.label}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="cost-items">
          <p className="hint">Ajouter une rune :</p>
          {favourites.length > 0 && (
            <div className="fav-chips">
              {favourites.map((fav) => (
                <button
                  type="button"
                  key={fav.id}
                  className="fav-chip"
                  onClick={() => addOutput(fav)}
                  disabled={outputIds.has(fav.id)}
                  title={outputIds.has(fav.id) ? "Déjà ajouté" : "Ajouter comme rune"}
                >
                  {fav.name}
                </button>
              ))}
            </div>
          )}
          <ItemAutocomplete
            onPick={addOutput}
            isPicked={(id) => outputIds.has(id)}
            placeholder="Rechercher une rune à ajouter…"
          />
        </div>
      </section>
    </main>
  );
}
