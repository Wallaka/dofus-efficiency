import { useEffect, useMemo, useState } from "react";
import {
  loadPercepteur,
  savePercepteur,
  evaluatePercepteur,
  bestByNetPerHour,
  newPercepteurRow,
  rememberZone,
  type PercepteurInput,
  type PercepteurRow,
} from "../lib/percepteur";
import { formatKamas } from "../lib/format";
import { PriceInput } from "../components/PriceInput";

const ZONES_DATALIST = "percepteur-zones";

/** A plain integer with thousands separators, e.g. 42500 -> "42 500". */
function count(value: number | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("fr-FR");
}

/**
 * The "Percepteurs" page: a repertoire of zones where you drop a percepteur, to
 * see which pay best. Per zone you note the loot value (rendement), the time in
 * minutes, and the per-zone potion cost; the page shows kamas/hour and the net
 * per hour after the potion, and highlights the best zone. Zones autocomplete
 * from the ones you've already typed (kept locally, no external data).
 */
export function PercepteurPage() {
  const [input, setInput] = useState<PercepteurInput>(loadPercepteur);

  useEffect(() => {
    savePercepteur(input);
  }, [input]);

  function addRow() {
    setInput((prev) => ({ ...prev, rows: [...prev.rows, newPercepteurRow()] }));
  }

  function removeRow(id: string) {
    setInput((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== id) }));
  }

  function patchRow(id: string, patch: Partial<PercepteurRow>) {
    setInput((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function commitZone(id: string, zone: string) {
    setInput((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, zone } : r)),
      zones: rememberZone(prev.zones, zone),
    }));
  }

  function setMinutes(id: string, raw: string) {
    const n = Math.floor(Number(raw));
    patchRow(id, {
      minutes: raw.trim() === "" || !Number.isFinite(n) || n <= 0 ? undefined : n,
    });
  }

  const results = useMemo(
    () => input.rows.map((row) => evaluatePercepteur(row)),
    [input.rows],
  );
  const best = bestByNetPerHour(results);

  // Total net kamas across every zone that has a rendement (potion deducted).
  const totalNet = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const { net } of results) {
      if (net != null) {
        sum += net;
        any = true;
      }
    }
    return any ? sum : undefined;
  }, [results]);

  return (
    <main className="percepteur-page">
      <section className="panel">
        <h2>Percepteurs</h2>
        <p className="hint">
          Répertoriez vos zones : notez le rendement d'un percepteur posé, le temps
          en minutes et le coût de la potion pour aller le récolter — on calcule le{" "}
          <b>net par heure</b> (potion déduite) et on met en avant la zone la plus
          rentable. Le coût de la potion se saisit par zone (il varie).
        </p>
        <p className="hint percepteur-caveat">
          ⚠ Saisie manuelle : la carte des zones n'est pas dans le catalogue de
          l'app. Le champ Zone se complète tout seul à partir des zones déjà
          saisies.
        </p>
        <button type="button" className="folder-pick percepteur-add" onClick={addRow}>
          + Ajouter une zone
        </button>
      </section>

      {input.rows.length > 0 && (
        <div className="percepteur-tiles">
          <div className="percepteur-tile accent">
            <span className="percepteur-tile-label">Renta totale</span>
            <span
              className={`percepteur-tile-value${totalNet != null ? (totalNet < 0 ? " neg" : " pos") : ""}`}
            >
              {totalNet != null ? formatKamas(totalNet) : "—"}
            </span>
            <span className="percepteur-tile-sub">
              net cumulé des {input.rows.length} zone{input.rows.length > 1 ? "s" : ""} (rendement − potion)
            </span>
          </div>
          <div className="percepteur-tile">
            <span className="percepteur-tile-label">Meilleure zone</span>
            <span
              className={`percepteur-tile-value${best ? (best.netPerHour! < 0 ? " neg" : " pos") : ""}`}
            >
              {best ? formatKamas(best.netPerHour) : "—"}
            </span>
            <span className="percepteur-tile-sub">
              {best ? `${best.row.zone || "—"} · net / heure` : "net / heure"}
            </span>
          </div>
          <div className="percepteur-tile">
            <span className="percepteur-tile-label">Zones répertoriées</span>
            <span className="percepteur-tile-value">{count(input.rows.length)}</span>
            <span className="percepteur-tile-sub">
              {input.rows.filter((r) => r.posed).length} percepteur(s) posé(s)
            </span>
          </div>
        </div>
      )}

      {input.rows.length === 0 ? (
        <p className="hint">
          Aucune zone. Cliquez « + Ajouter une zone » pour commencer votre
          répertoire.
        </p>
      ) : (
        <section className="panel">
          <div className="table-scroll">
            <ul className="percepteur-list">
              <li className="percepteur-head" aria-hidden>
                <span></span>
                <span>Zone / sous-zone</span>
                <span className="num">Temps (min)</span>
                <span className="num">Rendement</span>
                <span className="num">Coût potion</span>
                <span className="num">kamas/h</span>
                <span className="num">Net /h</span>
                <span></span>
              </li>
              {results.map(({ row, perHour, netPerHour }) => (
                <li
                  key={row.id}
                  className={`percepteur-row${best && row.id === best.row.id ? " percepteur-best" : ""}`}
                >
                  <button
                    type="button"
                    className={`percepteur-star${row.posed ? " on" : ""}`}
                    aria-pressed={row.posed ?? false}
                    aria-label={row.posed ? "Percepteur posé" : "Marquer comme posé"}
                    title={row.posed ? "Posé" : "Marquer posé"}
                    onClick={() => patchRow(row.id, { posed: !row.posed })}
                  >
                    {row.posed ? "★" : "☆"}
                  </button>
                  <span className="percepteur-zone">
                    <input
                      type="text"
                      list={ZONES_DATALIST}
                      className="percepteur-zone-input"
                      placeholder="Zone…"
                      aria-label="Zone"
                      value={row.zone}
                      onChange={(e) => patchRow(row.id, { zone: e.target.value })}
                      onBlur={(e) => commitZone(row.id, e.target.value)}
                    />
                  </span>
                  <span className="num">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className="percepteur-min-input"
                      aria-label={`Temps en minutes (${row.zone || "zone"})`}
                      placeholder="min"
                      value={row.minutes ?? ""}
                      onChange={(e) => setMinutes(row.id, e.target.value)}
                    />
                  </span>
                  <span className="num">
                    <PriceInput
                      value={row.rendement}
                      needs={row.rendement == null}
                      width={82}
                      ariaLabel={`Rendement (${row.zone || "zone"})`}
                      onCommit={(v) => patchRow(row.id, { rendement: v ?? undefined })}
                    />
                  </span>
                  <span className="num">
                    <PriceInput
                      value={row.potion}
                      width={82}
                      ariaLabel={`Coût potion (${row.zone || "zone"})`}
                      onCommit={(v) => patchRow(row.id, { potion: v ?? undefined })}
                    />
                  </span>
                  <span className="num percepteur-perh">{formatKamas(perHour)}</span>
                  <span
                    className={`num percepteur-neth${netPerHour != null && netPerHour < 0 ? " neg" : ""}`}
                  >
                    {formatKamas(netPerHour)}
                  </span>
                  <span className="num">
                    <button
                      type="button"
                      className="percepteur-remove"
                      aria-label={`Retirer ${row.zone || "cette zone"}`}
                      title="Retirer"
                      onClick={() => removeRow(row.id)}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <datalist id={ZONES_DATALIST}>
        {input.zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </main>
  );
}
