import type { AvisDeRecherche } from "../lib/avis";
import { carteItem, computeAvis, resourceItem } from "../lib/avis";
import type { Item, PriceMap } from "../types";
import { formatKamas } from "../lib/format";
import { ItemAutocomplete } from "./ItemAutocomplete";

interface Props {
  avis: AvisDeRecherche;
  prices: PriceMap;
  avitonValue?: number;
  onChange: (patch: Partial<AvisDeRecherche>) => void;
  onRemove: () => void;
  /** Update the shared price of a picked item (records a manual entry). */
  onSetItemPrice: (item: Item, price: number | undefined) => void;
}

function toNum(v: string): number | undefined {
  return v === "" ? undefined : Number(v);
}

export function AvisCard({
  avis,
  prices,
  avitonValue,
  onChange,
  onRemove,
  onSetItemPrice,
}: Props) {
  const r = computeAvis(avis, prices, avitonValue);
  const resource = resourceItem(avis);
  const carte = carteItem(avis);

  return (
    <li className="avis-card">
      <div className="avis-head">
        <input
          type="text"
          className="avis-name"
          placeholder="Nom de l'avis de recherche"
          value={avis.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Nom de l'avis"
        />
        <label className="avis-avitons">
          <span>Avitons</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={avis.avitons ?? ""}
            onChange={(e) => onChange({ avitons: toNum(e.target.value) })}
          />
        </label>
        <button
          type="button"
          className="avis-remove"
          onClick={onRemove}
          aria-label="Supprimer cet avis"
        >
          ✕
        </button>
      </div>

      {/* Resource reward */}
      <div className="avis-line">
        <span className="avis-line-label">Ressource</span>
        {resource == null ? (
          <ItemAutocomplete
            onPick={(item) =>
              onChange({
                resourceItemId: item.id,
                resourceName: item.name,
                resourceImg: item.img,
                resourceQty: avis.resourceQty ?? 1,
              })
            }
            placeholder="Ressource du coffre…"
          />
        ) : (
          <div className="avis-item">
            {resource.img && (
              <img src={resource.img} alt="" className="avis-icon" />
            )}
            <span className="avis-item-name">{resource.name}</span>
            <button
              type="button"
              className="avis-clear"
              onClick={() =>
                onChange({
                  resourceItemId: undefined,
                  resourceName: undefined,
                  resourceImg: undefined,
                })
              }
              aria-label="Changer de ressource"
            >
              ✕
            </button>
            <input
              type="number"
              className="avis-qty"
              min={0}
              inputMode="numeric"
              placeholder="Qté"
              value={avis.resourceQty ?? ""}
              onChange={(e) => onChange({ resourceQty: toNum(e.target.value) })}
              aria-label="Quantité de ressource"
            />
            <span className="avis-x">×</span>
            <input
              type="number"
              className="avis-price"
              min={0}
              inputMode="numeric"
              placeholder="prix"
              value={prices[resource.id] ?? ""}
              onChange={(e) => onSetItemPrice(resource, toNum(e.target.value))}
              aria-label="Prix unitaire de la ressource"
            />
            <span className={`avis-value ${r.missingResourcePrice ? "missing" : ""}`}>
              {r.missingResourcePrice
                ? "prix ?"
                : `+${formatKamas(r.resourceValue)}`}
            </span>
          </div>
        )}
      </div>

      {/* Carte cost */}
      <div className="avis-line">
        <span className="avis-line-label">Carte</span>
        {carte == null ? (
          <ItemAutocomplete
            onPick={(item) =>
              onChange({
                carteItemId: item.id,
                carteName: item.name,
                carteImg: item.img,
              })
            }
            placeholder="Carte de la chasse…"
          />
        ) : (
          <div className="avis-item">
            {carte.img && <img src={carte.img} alt="" className="avis-icon" />}
            <span className="avis-item-name">{carte.name}</span>
            <button
              type="button"
              className="avis-clear"
              onClick={() =>
                onChange({
                  carteItemId: undefined,
                  carteName: undefined,
                  carteImg: undefined,
                })
              }
              aria-label="Changer de carte"
            >
              ✕
            </button>
            <input
              type="number"
              className="avis-price"
              min={0}
              inputMode="numeric"
              placeholder="prix"
              value={prices[carte.id] ?? ""}
              onChange={(e) => onSetItemPrice(carte, toNum(e.target.value))}
              aria-label="Prix de la carte"
            />
            <span className={`avis-value ${r.missingCartePrice ? "missing" : ""}`}>
              {r.missingCartePrice ? "prix ?" : `−${formatKamas(r.carteCost)}`}
            </span>
          </div>
        )}
      </div>

      {/* Optional paid spots */}
      <div className="avis-line">
        <span className="avis-line-label">Places</span>
        <div className="avis-spots">
          <input
            type="number"
            className="avis-qty"
            min={0}
            inputMode="numeric"
            placeholder="nb"
            value={avis.spots ?? ""}
            onChange={(e) => onChange({ spots: toNum(e.target.value) })}
            aria-label="Nombre de places vendues"
          />
          <span className="avis-x">×</span>
          <input
            type="number"
            className="avis-price"
            min={0}
            inputMode="numeric"
            placeholder="prix/place"
            value={avis.pricePerSpot ?? ""}
            onChange={(e) => onChange({ pricePerSpot: toNum(e.target.value) })}
            aria-label="Prix par place"
          />
          <span className="avis-value">+{formatKamas(r.spotIncome)}</span>
        </div>
      </div>

      <div className="avis-benefit">
        <span>Bénéfice</span>
        <strong className={r.kamasBenefit >= 0 ? "positive" : "negative"}>
          {formatKamas(r.kamasBenefit)}
        </strong>
        {r.avitons > 0 && <span className="avis-aviton-tag">+{r.avitons} avitons</span>}
        {r.benefitWithAvitons != null && (
          <span className="avis-with-avitons">
            ({formatKamas(r.benefitWithAvitons)} avec avitons)
          </span>
        )}
      </div>
    </li>
  );
}
