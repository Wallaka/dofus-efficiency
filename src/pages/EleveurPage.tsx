import { useEffect, useMemo, useState } from "react";
import {
  computeEleveur,
  defaultEleveurInput,
  resolveFilet,
  runeExpectedQty,
  BRISAGE_LEVEL,
  ENERGY_PER_ENCLOS,
  RAISE_HOURS,
  type EleveurInput,
} from "../lib/eleveur";
import { bestFiletFor, filetsForLevel } from "../lib/filets";
import { planRotations, formatClock } from "../lib/planning";
import { MANGEOIRES } from "../lib/mangeoires";
import { MOUNTS, mountById } from "../lib/mounts";
import type { Item } from "../types";
import { loadEleveur, saveEleveur } from "../lib/storage";
import { usePrices } from "../lib/usePrices";
import { loadCraftTaxPercent } from "../lib/craftList";
import { formatKamas, formatKamasSigned, formatPercent } from "../lib/format";

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
  return Math.round(lo) === Math.round(hi) ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
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
 * Éleveur page — the "brisage" money-making loop, kept deliberately minimal.
 *
 * You set only your éleveur level and the mount you capture; the enclos, the
 * best filet, how many filets you need, and the brisage runes are all derived.
 * Only market prices (filet, runes) are entered, and they sync with the shared
 * price store.
 */
export function EleveurPage() {
  const [input, setInput] = useState<EleveurInput>(
    () => loadEleveur() ?? defaultEleveurInput(),
  );
  const { prices, setPrice, clearPrice } = usePrices();

  useEffect(() => {
    saveEleveur(input);
  }, [input]);

  const taxRate = loadCraftTaxPercent() / 100;

  // The filet in effect (explicit choice or auto-best). It catches a variable
  // number of mounts, so we evaluate both bounds: `low` = fewest caught (worst
  // case), `high` = most.
  const filet = resolveFilet(input);
  const bestFilet = input.mountCreature
    ? bestFiletFor(input.level, input.mountCreature)
    : undefined;
  const availableFilets = input.mountCreature
    ? filetsForLevel(input.level, input.mountCreature)
    : [];
  const low = useMemo(
    () => computeEleveur(input, prices, taxRate, filet?.mountsMin ?? 1),
    [input, prices, taxRate, filet],
  );
  const high = useMemo(
    () => computeEleveur(input, prices, taxRate, filet?.mountsMax ?? 1),
    [input, prices, taxRate, filet],
  );
  const result = high;
  const ranged = filet != null && filet.mountsMin !== filet.mountsMax;

  // Rotation planner: ideal login schedule within a connection window.
  const plan = useMemo(
    () =>
      planRotations({
        availFrom: input.availFrom ?? 8,
        availTo: input.availTo ?? 24,
        rotationHours: RAISE_HOURS,
        horizonDays: 3,
      }),
    [input.availFrom, input.availTo],
  );

  // A full week (Mon → Sun) for the forecast: rotations completed per weekday.
  const weekPlan = useMemo(
    () =>
      planRotations({
        availFrom: input.availFrom ?? 8,
        availTo: input.availTo ?? 24,
        rotationHours: RAISE_HOURS,
        horizonDays: 7,
      }),
    [input.availFrom, input.availTo],
  );
  const rotationsByDay = useMemo(() => {
    const arr = new Array(7).fill(0);
    for (const e of weekPlan.events) {
      if (e.type === "cycle" && e.day >= 0 && e.day < 7) arr[e.day] += 1;
    }
    return arr as number[];
  }, [weekPlan]);
  const weekRotations = rotationsByDay.reduce((a, b) => a + b, 0);

  function patch(p: Partial<EleveurInput>) {
    setInput((prev) => ({ ...prev, ...p }));
  }

  function selectMount(id: string) {
    const m = mountById(id);
    // Reset the filet choice to auto — a chosen filet may not fit the new creature.
    patch(
      m
        ? { mountId: m.id, mountLabel: m.name, mountImg: m.img, mountCreature: m.creature, filetId: undefined }
        : { mountId: undefined, mountLabel: undefined, mountImg: undefined, mountCreature: undefined, filetId: undefined },
    );
  }

  function setItemPrice(item: Item, v: string) {
    const n = num(v);
    if (n == null) clearPrice(item.id);
    else setPrice(item, n);
  }

  return (
    <main className="eleveur-page">
      {/* ---------------- Réglages ---------------- */}
      <section className="panel">
        <h2>Réglages</h2>
        <p className="hint">
          Votre niveau d'éleveur et la monture à capturer. Le reste (enclos,
          filet, nombre de filets, runes) est calculé automatiquement.
        </p>
        <div className="eleveur-settings">
          <div className="field eleveur-num">
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
          <div className="field eleveur-mount-field">
            <label htmlFor="mount">Monture à capturer</label>
            <div className="eleveur-mount">
              {input.mountImg && (
                <img src={input.mountImg} alt="" className="eleveur-mount-icon" />
              )}
              <select
                id="mount"
                value={input.mountId ?? ""}
                onChange={(e) => selectMount(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {MOUNTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.creature})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <p className="eleveur-derived-line">
          <strong>{result.enclos}</strong> enclos × {result.capacity} ={" "}
          <strong>{result.totalSlots}</strong> places
          {filet && (
            <>
              {" · filet auto : "}
              <strong>{filet.name}</strong> (niv {filet.level}, capture{" "}
              {filet.mountsMin === filet.mountsMax
                ? filet.mountsMin
                : `${filet.mountsMin}–${filet.mountsMax}`}
              /combat)
            </>
          )}
        </p>
      </section>

      {/* ---------------- Results dashboard ---------------- */}
      <section className="panel">
        <h2>Rentabilité du brisage</h2>
        <p className="hint">
          Capturer → élever → briser en runes → revendre. Chiffré depuis vos prix
          suivis ; la taxe HDV ({Math.round(taxRate * 100)}&nbsp;%) s'applique aux
          runes. Les valeurs « min – max » viennent de la capture variable du filet.
        </p>

        <div className="eleveur-tiles">
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Capacité</span>
            <span className="eleveur-tile-value">{result.totalSlots}</span>
            <span className="eleveur-tile-sub">
              {result.enclos} enclos × {result.capacity}
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Coût / monture</span>
            <span className="eleveur-tile-value">
              {fmtRange(high.costPerMount, low.costPerMount, formatKamas)}
            </span>
            <span className="eleveur-tile-sub">
              filet {fmtRange(high.captureCostPerMount, low.captureCostPerMount, formatKamas)}{" "}
              + nourriture {formatKamas(result.raiseCostPerMount)}
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
                : "espérance, après taxe"}
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
            <span className="eleveur-tile-label">Filets / rotation</span>
            <span className="eleveur-tile-value">
              {fmtRange(high.filtresPerCycle, low.filtresPerCycle, count)}
            </span>
            <span className="eleveur-tile-sub">
              {fmtRange(high.filtresCostPerCycle, low.filtresCostPerCycle, formatKamas)}
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Bénéfice / rotation</span>
            <span
              className={`eleveur-tile-value ${rangeProfitClass(low.profitPerCycle, high.profitPerCycle)}`}
            >
              {fmtRange(low.profitPerCycle, high.profitPerCycle, formatKamasSigned)}
            </span>
            <span className="eleveur-tile-sub">{result.totalSlots} montures</span>
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
              {input.rotationsPerDay ?? 1} rotation
              {(input.rotationsPerDay ?? 1) > 1 ? "s" : ""} / jour (~
              {RAISE_HOURS.toFixed(0)} h chacune)
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

        {result.runes.length > 0 && (
          <div className="eleveur-runes-summary">
            <span className="eleveur-runes-title">
              Runes récoltées par rotation (≈, sur {result.totalSlots} montures)
            </span>
            <div className="eleveur-runes-chips">
              {result.runes.map((r) => {
                const perMount = runeExpectedQty(r);
                return (
                  <div key={r.itemId} className="eleveur-rune-chip">
                    <img src={r.img} alt="" className="eleveur-rune-chip-icon" />
                    <span className="eleveur-rune-chip-count">
                      {count(perMount * result.totalSlots)}
                    </span>
                    <span className="eleveur-rune-chip-name">
                      {r.label}
                      <span className="eleveur-rune-chip-sub">
                        ≈ {perMount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} / monture
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="eleveur-week">
          <span className="eleveur-runes-title">
            Prévision 7 jours (lun. → dim.) · connecté{" "}
            {input.availFrom ?? 8} h–{input.availTo ?? 24} h
          </span>
          <div className="eleveur-week-grid">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d, i) => (
              <div key={d} className="eleveur-week-day">
                <span className="eleveur-week-dow">{d}</span>
                <span className="eleveur-week-rot">{rotationsByDay[i]} rot.</span>
                <span
                  className={`eleveur-week-profit ${rangeProfitClass(
                    rotationsByDay[i] * low.profitPerCycle,
                    rotationsByDay[i] * high.profitPerCycle,
                  )}`}
                >
                  {rotationsByDay[i] === 0
                    ? "—"
                    : fmtRange(
                        rotationsByDay[i] * low.profitPerCycle,
                        rotationsByDay[i] * high.profitPerCycle,
                        formatKamasSigned,
                      )}
                </span>
              </div>
            ))}
          </div>
          <div className="eleveur-week-total">
            Total semaine : <strong>{weekRotations} rotations</strong> ·{" "}
            <strong
              className={rangeProfitClass(
                weekRotations * low.profitPerCycle,
                weekRotations * high.profitPerCycle,
              )}
            >
              {fmtRange(
                weekRotations * low.profitPerCycle,
                weekRotations * high.profitPerCycle,
                formatKamasSigned,
              )}
            </strong>
          </div>
        </div>
      </section>

      {/* ---------------- Capture ---------------- */}
      <section className="panel">
        <h2>Capture</h2>
        {input.mountCreature ? (
          <>
            <p className="hint">
              Choisissez le filet pour comparer les rentabilités (« Auto » = le
              meilleur pour votre niveau). Le nombre de filets est calculé d'après
              sa capture ({ranged ? "variable" : "fixe"}).
            </p>
            <div className="eleveur-settings">
              <div className="field eleveur-mount-field">
                <label htmlFor="filet">Filet</label>
                <div className="eleveur-mount">
                  {filet && (
                    <img src={filet.img} alt="" className="eleveur-mount-icon" />
                  )}
                  <select
                    id="filet"
                    value={input.filetId ?? ""}
                    onChange={(e) =>
                      patch({ filetId: e.target.value || undefined })
                    }
                  >
                    <option value="">
                      Auto — meilleur{bestFilet ? ` (${bestFilet.name})` : ""}
                    </option>
                    {availableFilets.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} — capture{" "}
                        {f.mountsMin === f.mountsMax
                          ? f.mountsMin
                          : `${f.mountsMin}–${f.mountsMax}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {filet && (
                <div className="field eleveur-num">
                  <label htmlFor="filet-price">Prix du filet</label>
                  <input
                    id="filet-price"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="prix ?"
                    className={prices[filet.id] == null ? "needs-price" : ""}
                    value={prices[filet.id] ?? ""}
                    onChange={(e) =>
                      setItemPrice(
                        { id: filet.id, name: filet.name, img: filet.img },
                        e.target.value,
                      )
                    }
                  />
                </div>
              )}
            </div>
            {filet && (
              <p className="eleveur-derived-line">
                <strong>{filet.name}</strong> · capture{" "}
                {filet.mountsMin === filet.mountsMax
                  ? filet.mountsMin
                  : `${filet.mountsMin}–${filet.mountsMax}`}{" "}
                / combat ·{" "}
                <strong>{fmtRange(high.filtresPerCycle, low.filtresPerCycle, count)}</strong>{" "}
                filets pour remplir {result.totalSlots} places
              </p>
            )}
          </>
        ) : (
          <p className="hint">Choisissez une monture pour déterminer le filet.</p>
        )}
      </section>

      {/* ---------------- Élevage ---------------- */}
      <section className="panel">
        <h2>Élevage</h2>
        <p className="hint">
          Chaque monture atteint le niveau {BRISAGE_LEVEL} (utile au brisage) en{" "}
          <strong>{ENERGY_PER_ENCLOS.toLocaleString("fr-FR")} xp</strong> ≈{" "}
          <strong>{RAISE_HOURS.toFixed(1)} h</strong> (10 xp / 10 s). La mangeoire
          est une « batterie » d'énergie : il en faut{" "}
          {ENERGY_PER_ENCLOS.toLocaleString("fr-FR")} par enclos (partagé, 1 ou 10
          montures = pareil).
        </p>
        <div className="eleveur-settings">
          <div className="field eleveur-mount-field">
            <label htmlFor="mangeoire">Mangeoire</label>
            <div className="eleveur-mount">
              {result.mangeoire && (
                <img src={result.mangeoire.img} alt="" className="eleveur-mount-icon" />
              )}
              <select
                id="mangeoire"
                value={input.mangeoireId ?? ""}
                onChange={(e) =>
                  patch({ mangeoireId: e.target.value || undefined })
                }
              >
                <option value="">— Choisir —</option>
                {MANGEOIRES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.energy.toLocaleString("fr-FR")} én.)
                  </option>
                ))}
              </select>
            </div>
          </div>
          {result.mangeoire && (
            <div className="field eleveur-num">
              <label htmlFor="mangeoire-price">Prix mangeoire</label>
              <input
                id="mangeoire-price"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="prix ?"
                className={prices[result.mangeoire.id] == null ? "needs-price" : ""}
                value={prices[result.mangeoire.id] ?? ""}
                onChange={(e) =>
                  setItemPrice(
                    {
                      id: result.mangeoire!.id,
                      name: result.mangeoire!.name,
                      img: result.mangeoire!.img,
                    },
                    e.target.value,
                  )
                }
              />
            </div>
          )}
        </div>
        {result.mangeoire ? (
          <p className="eleveur-derived-line">
            <strong>{result.mangeoiresPerEnclos}</strong> mangeoires / enclos ×{" "}
            {result.enclos} = <strong>{result.mangeoiresPerCycle}</strong> par
            rotation · nourriture ={" "}
            <strong>{formatKamas(result.foodCostPerCycle)}</strong> (
            {formatKamas(result.raiseCostPerMount)} / monture)
          </p>
        ) : (
          <p className="hint eleveur-todo">
            🍽️ Choisissez une mangeoire pour compter la nourriture.
          </p>
        )}
        <div className="field eleveur-num eleveur-rotations">
          <label htmlFor="rotations">Rotations / jour</label>
          <input
            id="rotations"
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            placeholder="1"
            value={input.rotationsPerDay ?? ""}
            onChange={(e) => patch({ rotationsPerDay: num(e.target.value) })}
          />
          <p className="hint">
            Combien de cycles complets vous bouclez réellement par jour (une
            rotation ≈ {RAISE_HOURS.toFixed(0)} h + votre temps mort). Sert au
            bénéfice / jour — ou laissez le planning ci-dessous le remplir.
          </p>
        </div>
      </section>

      {/* ---------------- Planning des rotations ---------------- */}
      <section className="panel">
        <h2>Planning des rotations</h2>
        <p className="hint">
          Une rotation dure ~{RAISE_HOURS.toFixed(1)} h (qui « dérive » chaque
          jour) et il faut être connecté pour briser + remettre en enclos.
          Indiquez votre fenêtre de connexion : on calcule la meilleure heure de
          mise et l'horaire des connexions.
        </p>
        <div className="eleveur-settings">
          <div className="field eleveur-num">
            <label htmlFor="avail-from">Connecté dès (h)</label>
            <input
              id="avail-from"
              type="number"
              min={0}
              max={23}
              inputMode="numeric"
              value={input.availFrom ?? ""}
              placeholder="8"
              onChange={(e) => patch({ availFrom: num(e.target.value) })}
            />
          </div>
          <div className="field eleveur-num">
            <label htmlFor="avail-to">Jusqu'à (h)</label>
            <input
              id="avail-to"
              type="number"
              min={1}
              max={24}
              inputMode="numeric"
              value={input.availTo ?? ""}
              placeholder="24"
              onChange={(e) => patch({ availTo: num(e.target.value) })}
            />
          </div>
          <div className="eleveur-capture-total">
            <span className="eleveur-tile-label">Rotations / jour</span>
            <strong>{plan.rotationsPerDay.toFixed(1)}</strong>
          </div>
          <button
            type="button"
            className="eleveur-apply"
            onClick={() =>
              patch({ rotationsPerDay: Math.round(plan.rotationsPerDay * 10) / 10 })
            }
          >
            Utiliser pour le bénéfice / jour
          </button>
        </div>

        <p className="eleveur-derived-line">
          Meilleure heure de mise en enclos :{" "}
          <strong>{formatClock(plan.startClock)}</strong> · ~
          {plan.idleHours > 0
            ? `${(plan.idleHours / plan.horizonDays).toFixed(1)} h d'attente perdue / jour`
            : "aucune attente perdue"}
        </p>

        <ol className="eleveur-plan">
          {plan.events.slice(0, 6).map((ev, i) => (
            <li key={i} className={`eleveur-plan-ev ${ev.type}`}>
              <span className="eleveur-plan-time">
                J{ev.day + 1} · {formatClock(ev.clock)}
              </span>
              <span className="eleveur-plan-label">
                {ev.type === "place"
                  ? "Mettre en enclos"
                  : "Se connecter : briser + remettre en enclos"}
                {ev.idleHours > 0.05 && (
                  <span className="eleveur-plan-idle">
                    {" "}(après {ev.idleHours.toFixed(1)} h d'attente)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Brisage (runes) ---------------- */}
      <section className="panel">
        <h2>Brisage — runes obtenues</h2>
        <p className="hint">
          {input.mountLabel
            ? `Runes du brisage d'un ${input.mountLabel} (fixes). `
            : "Choisissez une monture pour voir ses runes. "}
          Proba × quantité (min–max) ; le total est l'espérance par monture. Seuls
          les prix sont modifiables (partagés avec vos prix suivis).
        </p>

        {result.runes.length === 0 ? (
          <p className="hint eleveur-empty">Aucune monture sélectionnée.</p>
        ) : (
          <ul className="cost-list">
            {result.runes.map((r) => {
              const unit = prices[r.itemId];
              const exp = runeExpectedQty(r);
              const missing = unit == null;
              return (
                <li key={r.itemId} className="cost-row item eleveur-rune-row">
                  <span className="cost-item-name">
                    <img src={r.img} alt="" className="eleveur-out-icon" />
                    {r.label}
                  </span>
                  <span className="eleveur-rune-readout">
                    {Math.round(r.chance * 100)}% ·{" "}
                    {r.quantityMin === r.quantityMax
                      ? r.quantityMin
                      : `${r.quantityMin}–${r.quantityMax}`}
                  </span>
                  <input
                    type="number"
                    className="cost-unit"
                    min={0}
                    inputMode="numeric"
                    placeholder="prix"
                    value={unit ?? ""}
                    onChange={(e) =>
                      setItemPrice(
                        { id: r.itemId, name: r.label, img: r.img },
                        e.target.value,
                      )
                    }
                    aria-label={`Prix unitaire de ${r.label}`}
                  />
                  <span
                    className={`cost-line-total ${missing ? "missing" : "positive"}`}
                    title={`≈ ${exp.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} / monture`}
                  >
                    {missing ? "prix ?" : formatKamas((unit ?? 0) * exp)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
