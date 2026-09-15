import { useEffect, useMemo, useState } from "react";
import {
  computeEleveur,
  defaultEleveurInput,
  resolveFilet,
  mountCreatureOf,
  runeExpectedQty,
  BRISAGE_LEVEL,
  ENERGY_PER_ENCLOS,
  RAISE_HOURS,
  type EleveurInput,
} from "../lib/eleveur";
import { bestFiletFor, filetsForLevel } from "../lib/filets";
import { planRotations, formatClock } from "../lib/planning";
import { MANGEOIRES } from "../lib/mangeoires";
import { MOUNTS, MULDOS, brisageFor, type RuneYield } from "../lib/mounts";
import {
  loadBrisageOverrides,
  saveBrisageOverrides,
  type BrisageOverrides,
} from "../lib/brisageStore";
import type { Item } from "../types";
import { loadEleveur, saveEleveur } from "../lib/storage";
import { usePrices } from "../lib/usePrices";
import { loadCraftTaxPercent } from "../lib/craftList";
import { formatKamas, formatKamasSigned, formatPercent } from "../lib/format";

/** Colour of one range bound: a loss (< 0) is red, else green if favourable, amber if not. */
function boundClass(v: number, favourable: boolean): string {
  if (v < 0) return "rng-neg";
  return favourable ? "rng-good" : "rng-bad";
}

/**
 * A value coloured by meaning, whether it's a single number or a min–max range.
 * `higherIsBetter` says which way is good (profit / revenue: high; cost / filets:
 * low). Single value: green for a gain, red for a loss, amber for a spend.
 * Range: favourable bound green, other amber, any negative bound red.
 */
function Range({
  a,
  b,
  fmt,
  higherIsBetter = true,
}: {
  a: number | undefined;
  b: number | undefined;
  fmt: (n: number | undefined) => string;
  higherIsBetter?: boolean;
}) {
  if (a == null || b == null) return <>—</>;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (Math.round(lo) === Math.round(hi)) {
    const v = lo;
    const cls = higherIsBetter
      ? v > 0
        ? "rng-good"
        : v < 0
          ? "rng-neg"
          : ""
      : v < 0
        ? "rng-neg"
        : "rng-bad";
    return <span className={cls}>{fmt(v)}</span>;
  }
  const loFavourable = !higherIsBetter; // for a cost, the low end is favourable
  return (
    <>
      <span className={boundClass(lo, loFavourable)}>{fmt(lo)}</span>
      <span className="rng-sep"> – </span>
      <span className={boundClass(hi, !loFavourable)}>{fmt(hi)}</span>
    </>
  );
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
  const [input, setInput] = useState<EleveurInput>(() => {
    const loaded = loadEleveur() as (EleveurInput & { mountId?: string }) | null;
    if (loaded == null) return defaultEleveurInput();
    // Migrate a legacy single-mount save to the multi-select shape.
    if (!loaded.mountIds && loaded.mountId) {
      return { ...loaded, mountIds: [loaded.mountId] };
    }
    return loaded;
  });
  const { prices, setPrice, clearPrice } = usePrices();
  const [tab, setTab] = useState<"sim" | "muldos">("sim");
  const [brisage, setBrisage] = useState<BrisageOverrides>(loadBrisageOverrides);

  useEffect(() => {
    saveEleveur(input);
  }, [input]);

  const taxRate = loadCraftTaxPercent() / 100;

  // ---- brisage overrides (Muldos tab) ----
  function runesFor(mountId: string): RuneYield[] {
    return brisage[mountId] ?? brisageFor(mountId);
  }
  function editRune(mountId: string, index: number, patch: Partial<RuneYield>) {
    const current = runesFor(mountId).map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
    const next = { ...brisage, [mountId]: current };
    setBrisage(next);
    saveBrisageOverrides(next);
  }
  function resetMuldo(mountId: string) {
    const next = { ...brisage };
    delete next[mountId];
    setBrisage(next);
    saveBrisageOverrides(next);
  }

  // The filet in effect (explicit choice or auto-best). It catches a variable
  // number of mounts, so we evaluate both bounds: `low` = fewest caught (worst
  // case), `high` = most.
  const creature = mountCreatureOf(input);
  const selectedIds = input.mountIds ?? [];
  const filet = resolveFilet(input);
  const bestFilet = creature ? bestFiletFor(input.level, creature) : undefined;
  const availableFilets = creature ? filetsForLevel(input.level, creature) : [];
  const low = useMemo(
    () => computeEleveur(input, prices, taxRate, filet?.mountsMin ?? 1, brisage),
    [input, prices, taxRate, filet, brisage],
  );
  const high = useMemo(
    () => computeEleveur(input, prices, taxRate, filet?.mountsMax ?? 1, brisage),
    [input, prices, taxRate, filet, brisage],
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

  function toggleMount(id: string) {
    setInput((prev) => {
      const cur = prev.mountIds ?? [];
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id];
      // Reset the filet choice to auto if the selection is emptied.
      return { ...prev, mountIds: next, filetId: next.length ? prev.filetId : undefined };
    });
  }

  function setItemPrice(item: Item, v: string) {
    const n = num(v);
    if (n == null) clearPrice(item.id);
    else setPrice(item, n);
  }

  return (
    <main className="eleveur-page">
      <div className="eleveur-tabs">
        <button
          type="button"
          className={tab === "sim" ? "active" : ""}
          onClick={() => setTab("sim")}
        >
          Simulateur
        </button>
        <button
          type="button"
          className={tab === "muldos" ? "active" : ""}
          onClick={() => setTab("muldos")}
        >
          Muldos (brisage)
        </button>
      </div>

      {tab === "muldos" && (
        <section className="panel">
          <h2>Estimation du brisage par muldo</h2>
          <p className="hint">
            Ajustez la proba et la quantité (min–max) de chaque rune obtenue au
            brisage. Ces valeurs sont utilisées par le simulateur. « Réinitialiser
            » revient aux valeurs par défaut.
          </p>
          <div className="eleveur-muldos-edit">
            {MULDOS.map((m) => {
              const runes = runesFor(m.id);
              const overridden = brisage[m.id] != null;
              return (
                <div key={m.id} className="eleveur-muldo-card">
                  <div className="eleveur-muldo-head">
                    <img src={m.img} alt="" className="eleveur-mount-icon" />
                    <span className="eleveur-muldo-name">{m.name}</span>
                    {overridden && <span className="eleveur-muldo-badge">modifié</span>}
                    <button
                      type="button"
                      className="eleveur-muldo-reset"
                      disabled={!overridden}
                      onClick={() => resetMuldo(m.id)}
                    >
                      Réinitialiser
                    </button>
                  </div>
                  <ul className="cost-list">
                    {runes.map((r, i) => (
                      <li key={r.itemId} className="cost-row item eleveur-rune-row">
                        <span className="cost-item-name">
                          <img src={r.img} alt="" className="eleveur-out-icon" />
                          {r.label}
                        </span>
                        <label className="eleveur-rune-field">
                          <span>proba</span>
                          <input
                            type="number"
                            className="eleveur-rune-pct"
                            min={0}
                            max={100}
                            inputMode="numeric"
                            value={Math.round(r.chance * 100)}
                            onChange={(e) => {
                              const v = num(e.target.value);
                              editRune(m.id, i, {
                                chance: v == null ? 0 : Math.min(1, v / 100),
                              });
                            }}
                            aria-label={`Probabilité de ${r.label} pour ${m.name}`}
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
                            value={r.quantityMin}
                            onChange={(e) =>
                              editRune(m.id, i, { quantityMin: num(e.target.value) ?? 0 })
                            }
                            aria-label={`Quantité min de ${r.label} pour ${m.name}`}
                          />
                          <span className="cost-x">à</span>
                          <input
                            type="number"
                            className="eleveur-rune-qty"
                            min={0}
                            inputMode="decimal"
                            value={r.quantityMax}
                            onChange={(e) =>
                              editRune(m.id, i, { quantityMax: num(e.target.value) ?? 0 })
                            }
                            aria-label={`Quantité max de ${r.label} pour ${m.name}`}
                          />
                        </label>
                        <span className="eleveur-rune-readout">
                          ≈{" "}
                          {runeExpectedQty(r).toLocaleString("fr-FR", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          / monture
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "sim" && (
        <>
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
            <span className="eleveur-field-label">
              Montures à capturer{" "}
              {selectedIds.length > 1 && (
                <span className="eleveur-mount-count">
                  {selectedIds.length} sélectionnés · capacité répartie
                </span>
              )}
            </span>
            <div className="eleveur-mount-checks">
              {MOUNTS.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`eleveur-mount-check ${checked ? "checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMount(m.id)}
                    />
                    <img src={m.img} alt="" className="eleveur-mount-check-icon" />
                    {m.name}
                  </label>
                );
              })}
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
              <Range a={low.costPerMount} b={high.costPerMount} fmt={formatKamas} higherIsBetter={false} />
            </span>
            <span className="eleveur-tile-sub">
              filet{" "}
              <Range a={low.captureCostPerMount} b={high.captureCostPerMount} fmt={formatKamas} higherIsBetter={false} />{" "}
              + nourriture {formatKamas(result.raiseCostPerMount)}
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Runes / monture</span>
            <span className="eleveur-tile-value">
              <Range a={result.netRevenuePerMount} b={result.netRevenuePerMount} fmt={formatKamas} />
            </span>
            <span className="eleveur-tile-sub">
              {result.taxPerMount > 0
                ? `brut ${formatKamas(result.grossRevenuePerMount)} − taxe`
                : "espérance, après taxe"}
            </span>
          </div>
          <div className="eleveur-tile accent">
            <span className="eleveur-tile-label">Bénéfice / monture</span>
            <span className="eleveur-tile-value">
              <Range a={low.profitPerMount} b={high.profitPerMount} fmt={formatKamasSigned} />
            </span>
            <span className="eleveur-tile-sub">
              marge <Range a={low.marginRatio} b={high.marginRatio} fmt={formatPercent} />
            </span>
          </div>
        </div>

        <div className="eleveur-tiles">
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Filets / rotation</span>
            <span className="eleveur-tile-value">
              <Range a={low.filtresPerCycle} b={high.filtresPerCycle} fmt={count} higherIsBetter={false} />
            </span>
            <span className="eleveur-tile-sub">
              <Range a={low.filtresCostPerCycle} b={high.filtresCostPerCycle} fmt={formatKamas} higherIsBetter={false} />
            </span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Bénéfice / rotation</span>
            <span className="eleveur-tile-value">
              <Range a={low.profitPerCycle} b={high.profitPerCycle} fmt={formatKamasSigned} />
            </span>
            <span className="eleveur-tile-sub">{result.totalSlots} montures</span>
          </div>
          <div className="eleveur-tile">
            <span className="eleveur-tile-label">Bénéfice / jour</span>
            <span className="eleveur-tile-value">
              <Range a={low.profitPerDay} b={high.profitPerDay} fmt={formatKamasSigned} />
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
              {result.runes.map((r) => (
                <div key={r.itemId} className="eleveur-rune-chip">
                  <img src={r.img} alt="" className="eleveur-rune-chip-icon" />
                  <span className="eleveur-rune-chip-count">
                    {count(r.perMount * result.totalSlots)}
                  </span>
                  <span className="eleveur-rune-chip-name">
                    {r.label}
                    <span className="eleveur-rune-chip-sub">
                      ≈ {r.perMount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} / monture
                    </span>
                  </span>
                </div>
              ))}
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
                <span className="eleveur-week-profit">
                  {rotationsByDay[i] === 0 ? (
                    "—"
                  ) : (
                    <Range
                      a={rotationsByDay[i] * low.profitPerCycle}
                      b={rotationsByDay[i] * high.profitPerCycle}
                      fmt={formatKamasSigned}
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="eleveur-week-total">
            Total semaine : <strong>{weekRotations} rotations</strong> ·{" "}
            <strong>
              <Range
                a={weekRotations * low.profitPerCycle}
                b={weekRotations * high.profitPerCycle}
                fmt={formatKamasSigned}
              />
            </strong>
          </div>
        </div>
      </section>

      {/* ---------------- Capture ---------------- */}
      <section className="panel">
        <h2>Capture</h2>
        {creature ? (
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
                <strong>
                  <Range a={low.filtresPerCycle} b={high.filtresPerCycle} fmt={count} higherIsBetter={false} />
                </strong>{" "}
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
          {selectedIds.length > 0
            ? `Runes (espérance moyenne par monture sur ${selectedIds.length > 1 ? "les muldos sélectionnés" : "le muldo"}). `
            : "Choisissez une ou plusieurs montures pour voir leurs runes. "}
          Ajustez proba/quantité dans l'onglet « Muldos ». Seuls les prix sont
          modifiables ici (partagés avec vos prix suivis).
        </p>

        {result.runes.length === 0 ? (
          <p className="hint eleveur-empty">Aucune monture sélectionnée.</p>
        ) : (
          <ul className="cost-list">
            {result.runes.map((r) => {
              const unit = prices[r.itemId];
              const exp = r.perMount;
              const missing = unit == null;
              return (
                <li key={r.itemId} className="cost-row item eleveur-rune-row">
                  <span className="cost-item-name">
                    <img src={r.img} alt="" className="eleveur-out-icon" />
                    {r.label}
                  </span>
                  <span className="eleveur-rune-readout">
                    ≈ {exp.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} / monture
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
        </>
      )}
    </main>
  );
}
