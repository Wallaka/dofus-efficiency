import { useMemo, useState } from "react";
import { ARCHIMONSTERS } from "../data/archimonsters.generated";
import {
  SOUL_STONES,
  ocreRow,
  ocreSummary,
  type OcreRow,
  type Archimonster,
} from "../data/ocre";
import { usePrices } from "../lib/usePrices";
import { useCaptured } from "../lib/useCaptured";
import { isStale } from "../lib/priceStore";
import { formatKamas } from "../lib/format";
import { CopyName } from "../components/CopyName";
import { MetamobImport } from "../components/MetamobImport";

/**
 * "Ocre" — the Chasse aux archimonstres tracker. Progress toward the Dofus Ocre
 * plus, for each archimonster, the cost to buy its soul at the HDV vs. capture it
 * with the required stone, and the resale benefit of capturing.
 *
 * Every price — soul buy prices and the five capture stones — comes from the
 * shared store (OCR / Craft / Objets suivis / HDV / Prix). Nothing is entered
 * here; the page only reads and compares.
 */

type StatusFilter = "all" | "missing" | "captured";
type SortKey = "cost" | "benefit" | "level" | "age" | "name";

export function OcrePage() {
  const { prices, entries, setPrice, clearPrice } = usePrices();
  const { isCaptured, toggle, applyCaptures, capturedCount } = useCaptured();

  const [status, setStatus] = useState<StatusFilter>("missing");
  const [sort, setSort] = useState<SortKey>("cost");
  const [query, setQuery] = useState("");

  // Resolve every archimonster against the current prices + capture state.
  const rows = useMemo<OcreRow[]>(
    () =>
      ARCHIMONSTERS.map((archi) =>
        ocreRow(archi, isCaptured(archi.monsterId), prices),
      ),
    [prices, isCaptured],
  );

  const summary = useMemo(() => ocreSummary(rows), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (status === "missing" && r.captured) return false;
      if (status === "captured" && !r.captured) return false;
      if (q && !r.archi.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const soulAge = (r: OcreRow) =>
      r.archi.soulItemId ? entries[r.archi.soulItemId]?.updatedAt : undefined;
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "cost": // cheapest to complete first; unpriced last
          return (a.bestCost ?? Infinity) - (b.bestCost ?? Infinity);
        case "benefit": // most resale profit first; unknown last
          return (b.benefit ?? -Infinity) - (a.benefit ?? -Infinity);
        case "level":
          return a.archi.level - b.archi.level;
        case "age": // oldest price first (needs re-scan)
          return (soulAge(a) ?? Infinity) - (soulAge(b) ?? Infinity);
        case "name":
          return a.archi.name.localeCompare(b.archi.name, "fr");
      }
    });
    return list;
  }, [rows, status, query, sort, entries]);

  // Type a soul's HDV buy price directly on the page (writes to the shared store).
  function commitBuy(archi: Archimonster, raw: string) {
    const id = archi.soulItemId;
    if (!id) return;
    const text = raw.replace(/\s/g, "");
    if (text === "") {
      clearPrice(id);
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return;
    setPrice(
      { id, name: archi.soulName || archi.name, level: archi.level, img: archi.soulImg },
      Math.round(value),
      "manual",
      "Saisie Ocre",
    );
  }

  const empty = ARCHIMONSTERS.length === 0;

  return (
    <section className="ocre">
      <div className="page-head">
        <h2>Chasse aux archimonstres</h2>
        <span className="page-sub">
          La route vers le Dofus Ocre — capturer chaque âme une fois.
        </span>
      </div>

      {empty ? (
        <p className="ocre-empty panel">
          Aucun archimonstre chargé. Lance <code>npm run fetch:ocre</code>{" "}
          localement pour récupérer la liste depuis DofusDB, puis recharge la
          page.
        </p>
      ) : (
        <>
          {/* KPI tiles */}
          <section className="ocre-stats">
            <div className="tile">
              <div className="tile-label">Progression</div>
              <div className="tile-value">
                {capturedCount}{" "}
                <span className="tile-of">/ {summary.total}</span>
              </div>
              <div className="tile-foot">
                {summary.missingCount} manquants ·{" "}
                {Math.round(summary.progress * 100)} %
              </div>
              <div className="ocre-bar">
                <span style={{ width: `${summary.progress * 100}%` }} />
              </div>
            </div>

            <div className="tile hero">
              <div className="tile-label">Coût pour compléter</div>
              <div className="tile-value accent">
                {formatKamas(summary.costToComplete)}
              </div>
              <div className="tile-foot">
                manquants · chemin le moins cher
                {summary.completeUnpriced > 0 &&
                  ` · ${summary.completeUnpriced} sans prix`}
              </div>
            </div>

            <div className="tile">
              <div className="tile-label">Reste à acheter (HDV)</div>
              <div className="tile-value buyc">
                {formatKamas(summary.remainingHdv)}
              </div>
              <div className="tile-foot">
                acheter les âmes manquantes
                {summary.remainingHdvUnpriced > 0 &&
                  ` · ${summary.remainingHdvUnpriced} sans prix`}
              </div>
            </div>

            <div className="tile">
              <div className="tile-label">Prix du pack HDV</div>
              <div className="tile-value buyc">
                {formatKamas(summary.packHdv)}
              </div>
              <div className="tile-foot">
                collection complète, tout acheter
                {summary.packHdvUnpriced > 0 &&
                  ` · ${summary.packHdvUnpriced} sans prix`}
              </div>
            </div>

            <div className="tile">
              <div className="tile-label">Prix du pack capturé</div>
              <div className="tile-value capc">
                {formatKamas(summary.packCaptured)}
              </div>
              <div className="tile-foot">collection complète, pierres seules</div>
            </div>

            <div className="tile">
              <div className="tile-label">Économie en capturant</div>
              <div className="tile-value">
                {formatKamas(summary.saving)}
              </div>
              <div className="tile-foot pos">vs acheter les manquants à l'HDV</div>
            </div>
          </section>

          {/* Capture-stone prices, read from the shared store (set on Craft / Prix). */}
          <div className="ocre-stones panel">
            <span className="ocre-stones-label">Pierres d'âme</span>
            {SOUL_STONES.map((s) => {
              const price = prices[s.itemId];
              return (
                <span key={s.itemId} className="ocre-stone">
                  <span className="tag stone">
                    {s.name.replace(/ pierre.*/i, "")}
                  </span>
                  {price != null ? (
                    <span className="price">
                      {formatKamas(price)}
                    </span>
                  ) : (
                    <span className="ocre-noprice">—</span>
                  )}
                </span>
              );
            })}
            {SOUL_STONES.some((s) => prices[s.itemId] == null) && (
              <span className="ocre-stones-hint">
                prix manquants → à renseigner sur Craft / Prix
              </span>
            )}
          </div>

          <MetamobImport onApply={applyCaptures} />

          {/* Controls */}
          <div className="ocre-controls">
            <div className="segmented">
              <button
                className={status === "all" ? "on" : ""}
                onClick={() => setStatus("all")}
              >
                Tous
              </button>
              <button
                className={status === "missing" ? "on" : ""}
                onClick={() => setStatus("missing")}
              >
                Manquants
              </button>
              <button
                className={status === "captured" ? "on" : ""}
                onClick={() => setStatus("captured")}
              >
                Capturés
              </button>
            </div>
            <select
              className="ocre-field"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="cost">Trier : moins cher à compléter</option>
              <option value="benefit">Bénéfice ↓ (farm &amp; revente)</option>
              <option value="level">Niveau ↑</option>
              <option value="age">Prix — plus ancien</option>
              <option value="name">Nom</option>
            </select>
            <input
              className="ocre-field"
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="ocre-count">
              {visible.length} affichés
            </span>
          </div>

          {/* Table */}
          <div className="panel ocre-table-wrap">
            <table className="ocre-table">
              <thead>
                <tr>
                  <th className="col-chk" />
                  <th>Archimonstre</th>
                  <th className="num col-lvl">Niv.</th>
                  <th className="num col-buy">Âme (HDV)</th>
                  <th className="col-stone">Pierre requise</th>
                  <th className="num col-benefit">Bénéfice</th>
                  <th className="col-best">Meilleur choix</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <OcreTableRow
                    key={r.archi.monsterId}
                    row={r}
                    age={
                      r.archi.soulItemId
                        ? entries[r.archi.soulItemId]?.updatedAt
                        : undefined
                    }
                    onToggle={() => toggle(r.archi.monsterId)}
                    onCommitBuy={(raw) => commitBuy(r.archi, raw)}
                  />
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <p className="ocre-none">Aucun archimonstre pour ce filtre.</p>
            )}
          </div>

          <p className="ocre-legend">
            <b>Âme (HDV)</b> = prix d'achat de l'« Âme de … ».{" "}
            <b>Pierre requise</b> = pierre la plus petite couvrant le niveau (son
            prix = coût de capture). <b>Bénéfice</b> = capturer puis revendre
            l'âme → Âme − Pierre. <b>Meilleur choix</b> = pour compléter le
            Dofus, acheter ou capturer.
          </p>
        </>
      )}
    </section>
  );
}

function priceDot(
  buyPrice: number | undefined,
  age: number | undefined,
): "fresh" | "stale" | "none" {
  if (buyPrice == null) return "none";
  if (age != null && isStale(age)) return "stale";
  return "fresh";
}

interface RowProps {
  row: OcreRow;
  age: number | undefined;
  onToggle: () => void;
  onCommitBuy: (raw: string) => void;
}

function OcreTableRow({ row, age, onToggle, onCommitBuy }: RowProps) {
  const { archi, captured, stone, buyPrice, stonePrice, benefit, bestPath } = row;
  const dot = priceDot(buyPrice, age);
  // Local draft so typing doesn't fight the stored value; committed on blur.
  const [buyDraft, setBuyDraft] = useState<string | null>(null);

  return (
    <tr className={captured ? "captured" : ""}>
      <td className="col-chk">
        <button
          type="button"
          className={`ocre-chk${captured ? " on" : ""}`}
          aria-label={captured ? "Marquer non capturé" : "Marquer capturé"}
          title={
            captured && archi.monsterId
              ? "Capturé — cliquer pour annuler"
              : "Marquer capturé"
          }
          onClick={onToggle}
        >
          {captured ? "✓" : ""}
        </button>
      </td>

      <td>
        <div className="ocre-mon">
          {archi.img ? (
            <img className="ocre-avatar" src={archi.img} alt="" loading="lazy" />
          ) : (
            <span className="ocre-avatar placeholder" />
          )}
          <div className="ocre-mon-text">
            <span className="ocre-name-row">
              <span className="ocre-name">{archi.name}</span>
              <CopyName text={archi.name} />
            </span>
            {archi.soulName && (
              <span className="ocre-soul">{archi.soulName}</span>
            )}
          </div>
        </div>
      </td>

      <td className="num col-lvl">{archi.level}</td>

      <td className="num col-buy">
        {archi.soulItemId ? (
          <span className="ocre-buy">
            <span className={`dot ${dot}`} title={dot === "stale" ? "prix à revérifier" : undefined} />
            <input
              className="ocre-buy-input"
              inputMode="numeric"
              placeholder="prix ?"
              aria-label={`Prix de l'âme de ${archi.name}`}
              value={
                buyDraft ?? (buyPrice != null ? String(Math.round(buyPrice)) : "")
              }
              onChange={(e) => setBuyDraft(e.target.value)}
              onBlur={(e) => {
                onCommitBuy(e.target.value);
                setBuyDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </span>
        ) : (
          <span className="ocre-noprice">
            <span className="dot none" />
            âme ?
          </span>
        )}
      </td>

      <td className="col-stone">
        <span className="tag stone">
          {stone.name.replace(/ pierre.*/i, "")}
        </span>{" "}
        {stonePrice != null ? (
          <span className="price">{formatKamas(stonePrice)}</span>
        ) : (
          <span className="ocre-noprice">prix ?</span>
        )}
      </td>

      <td className="num col-benefit">
        {benefit != null ? (
          <span
            className={`price ${benefit > 0 ? "pos" : benefit < 0 ? "neg" : ""}`}
          >
            {benefit > 0 ? "+" : benefit < 0 ? "−" : ""}
            {formatKamas(Math.abs(benefit))}
          </span>
        ) : (
          <span className="ocre-noprice">?</span>
        )}
      </td>

      <td className="col-best">
        {captured ? (
          <span className="ocre-done">✓ Capturé</span>
        ) : bestPath ? (
          <span className="ocre-verdict">
            <span className={`badge ${bestPath === "buy" ? "buy" : "cap"}`}>
              {bestPath === "buy" ? "Acheter" : "Capturer"}
            </span>
            {buyPrice != null && stonePrice != null && (
              <span className="ocre-delta">
                −{formatKamas(Math.abs(buyPrice - stonePrice))}
              </span>
            )}
          </span>
        ) : (
          <span className="ocre-noprice">prix inconnus</span>
        )}
      </td>
    </tr>
  );
}
