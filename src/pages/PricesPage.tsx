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
  const [filter, setFilter] = useState("");
  const now = Date.now();

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );
  // Accent/case-insensitive name filter (so "fleur" finds "Fleur de …").
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const query = norm(filter.trim());
  const shown = sorted
    .filter((e) => !staleOnly || isStale(e.updatedAt, now))
    .filter((e) => !query || norm(e.name).includes(query));

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

          <div className="prices-search">
            <input
              type="search"
              className="prices-search-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer par nom…"
              aria-label="Filtrer les prix par nom"
            />
            {filter.trim() !== "" && (
              <span className="hint">
                {shown.length} / {entries.length}
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="hint">Aucun objet ne correspond à la recherche.</p>
          ) : (
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
                      <td className="num">
                        {formatKamas(e.price)}
                        {e.lots && e.lots.length > 0 && (
                          <span className="price-lots">
                            {e.lots
                              .map(
                                (l) =>
                                  `×${l.quantity} ${formatKamas(l.price ?? undefined)}`,
                              )
                              .join(" · ")}
                          </span>
                        )}
                      </td>
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
          )}
        </>
      )}
    </section>
  );
}
