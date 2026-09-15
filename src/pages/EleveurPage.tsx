import { useEffect, useMemo, useState } from "react";
import {
  computeEleveur,
  defaultEleveurInput,
  runeExpectedQty,
  type EleveurInput,
} from "../lib/eleveur";
import { bestFiletFor } from "../lib/filets";
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

  // The auto-picked filet catches a variable number of mounts, so we evaluate
  // both bounds: `low` = fewest mounts caught (worst case), `high` = most.
  const filet = input.mountCreature
    ? bestFiletFor(input.level, input.mountCreature)
    : undefined;
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

  function patch(p: Partial<EleveurInput>) {
    setInput((prev) => ({ ...prev, ...p }));
  }

  function selectMount(id: string) {
    const m = mountById(id);
    patch(
      m
        ? { mountId: m.id, mountLabel: m.name, mountImg: m.img, mountCreature: m.creature }
        : { mountId: undefined, mountLabel: undefined, mountImg: undefined, mountCreature: undefined },
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
            <span className="eleveur-tile-sub">filet (nourriture à définir)</span>
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
              {input.raiseHours ? `rotations de ${input.raiseHours} h (24 h)` : "durée non saisie"}
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

      {/* ---------------- Capture ---------------- */}
      <section className="panel">
        <h2>Capture</h2>
        {filet ? (
          <>
            <p className="hint">
              Filet auto pour votre niveau et cette monture. Nombre de filets
              nécessaires calculé d'après sa capture ({ranged ? "variable" : "fixe"}).
            </p>
            <div className="eleveur-capture-auto">
              <span className="eleveur-filet-name">
                <img src={filet.img} alt="" className="eleveur-out-icon" />
                {filet.name}
              </span>
              <span className="eleveur-capture-meta">
                capture{" "}
                {filet.mountsMin === filet.mountsMax
                  ? filet.mountsMin
                  : `${filet.mountsMin}–${filet.mountsMax}`}{" "}
                / combat · <strong>{fmtRange(high.filtresPerCycle, low.filtresPerCycle, count)}</strong>{" "}
                filets pour remplir {result.totalSlots} places
              </span>
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
            </div>
          </>
        ) : (
          <p className="hint">Choisissez une monture pour déterminer le filet.</p>
        )}
      </section>

      {/* ---------------- Élevage ---------------- */}
      <section className="panel">
        <h2>Élevage</h2>
        <p className="hint">
          Une monture met environ 10 h à atteindre le niveau utile au brisage. La
          nourriture dépendra de la mangeoire choisie (à venir).
        </p>
        <div className="field eleveur-num">
          <label htmlFor="hours">Durée d'élevage (heures)</label>
          <input
            id="hours"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="10"
            value={input.raiseHours ?? ""}
            onChange={(e) => patch({ raiseHours: num(e.target.value) })}
          />
          <p className="hint">Sert au bénéfice par jour.</p>
        </div>
        <p className="hint eleveur-todo">
          🍽️ Coût de nourriture (mangeoire) : à configurer — non compté pour l'instant.
        </p>
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
