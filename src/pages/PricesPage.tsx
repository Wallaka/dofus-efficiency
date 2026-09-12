import { useMemo, useState } from "react";
import {
  loadPriceEntries,
  deletePriceEntry,
  isStale,
  relativeAge,
  STALE_AFTER_MS,
  type PriceEntry,
} from "../lib/priceStore";
import { formatKamas, formatDateTime } from "../lib/format";

const STALE_DAYS = Math.round(STALE_AFTER_MS / (24 * 60 * 60 * 1000));

/**
 * The stored-prices page: every price we've kept, when it was recorded and how,
 * and whether it's fresh or needs re-scanning. This is the visible face of the
 * price feedback loop.
 */
export function PricesPage() {
  const [entries, setEntries] = useState<PriceEntry[]>(() =>
    Object.values(loadPriceEntries()),
  );
  const [staleOnly, setStaleOnly] = useState(false);
  const now = Date.now();

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );
  const shown = staleOnly
    ? sorted.filter((e) => isStale(e.updatedAt, now))
    : sorted;

  const staleCount = entries.filter((e) => isStale(e.updatedAt, now)).length;
  const freshCount = entries.length - staleCount;

  function remove(itemId: string) {
    deletePriceEntry(itemId);
    setEntries((prev) => prev.filter((e) => e.itemId !== itemId));
  }

  return (
    <section className="panel prices-page">
      <h2>Prix enregistrés</h2>
      <p className="hint">
        Les prix connus, avec leur date et leur origine. Un prix de plus de{" "}
        {STALE_DAYS} jour{STALE_DAYS > 1 ? "s" : ""} est marqué «&nbsp;à mettre à
        jour&nbsp;».
      </p>

      {entries.length === 0 ? (
        <p className="hint">
          Aucun prix enregistré pour l'instant. Analysez une capture (OCR) et
          cliquez «&nbsp;Enregistrer ce prix&nbsp;», ou saisissez un prix dans
          l'éditeur de la page Craft.
        </p>
      ) : (
        <>
          <div className="prices-summary">
            <span className="badge badge-fresh">{freshCount} à jour</span>
            <span className="badge badge-stale">{staleCount} à mettre à jour</span>
            <label className="prices-filter">
              <input
                type="checkbox"
                checked={staleOnly}
                onChange={(e) => setStaleOnly(e.target.checked)}
              />
              À mettre à jour seulement
            </label>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Objet</th>
                  <th className="num">Prix</th>
                  <th>Origine</th>
                  <th>Dernière analyse</th>
                  <th>État</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const stale = isStale(e.updatedAt, now);
                  return (
                    <tr key={e.itemId}>
                      <td>
                        <span className="price-item">
                          {e.img && (
                            <img src={e.img} alt="" className="autocomplete-icon" />
                          )}
                          <span className="item-name">{e.name}</span>
                          {e.level != null && (
                            <span className="recipe-detail">Niv. {e.level}</span>
                          )}
                        </span>
                      </td>
                      <td className="num">{formatKamas(e.price)}</td>
                      <td>
                        {e.source === "ocr" ? "OCR" : "Manuel"}
                        {e.detail && (
                          <span className="recipe-detail">{e.detail}</span>
                        )}
                      </td>
                      <td title={formatDateTime(e.updatedAt)}>
                        {relativeAge(e.updatedAt, now)}
                      </td>
                      <td>
                        <span
                          className={`badge ${stale ? "badge-stale" : "badge-fresh"}`}
                        >
                          {stale ? "À mettre à jour" : "À jour"}
                        </span>
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="folder-secondary price-del"
                          onClick={() => remove(e.itemId)}
                          aria-label={`Supprimer ${e.name}`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
