import type { AvisReward } from "../lib/avis";
import { computeAvisBenefit } from "../lib/avis";
import { formatKamas, formatKamasSigned } from "../lib/format";

interface Props {
  avis: AvisReward;
  /** Tracked HDV price of the "Carte de …" hunt map you must buy, if known. */
  cartePrice?: number;
  /** Tracked HDV price of the resource inside the chest, if known. */
  resourcePrice?: number;
  /** Value of this avis's avitons (avitons × per-aviton rate); 0 when unset. */
  avitonValue?: number;
  /** Flat fee paid to join this hunt's "spot" (per avis). */
  participationCost?: number;
  /** Update this avis's participation fee. */
  onParticipationChange?: (value: number) => void;
}

/** One priceable line: icon, label + item name, and price (or "—"). */
function AvisLine({
  variant,
  label,
  name,
  img,
  placeholder = "—",
  price,
}: {
  variant: "cost" | "reward";
  label: string;
  name?: string;
  img?: string;
  placeholder?: string;
  price?: number;
}) {
  return (
    <div className={`avis-line avis-line--${variant}`}>
      <div className="avis-line-icon">
        {img ? <img src={img} alt="" /> : <span aria-hidden>{placeholder}</span>}
      </div>
      <div className="avis-line-body">
        <span className="avis-line-label">{label}</span>
        <span className="avis-line-name" title={name}>
          {name ?? "Inconnu"}
        </span>
      </div>
      <span className="avis-line-price">
        {price != null ? formatKamas(price) : "—"}
      </span>
    </div>
  );
}

/** One avis de recherche: picture, name, level, avitons + carte cost / resource + aviton reward / benefit. */
export function AvisCard({
  avis,
  cartePrice,
  resourcePrice,
  avitonValue = 0,
  participationCost = 0,
  onParticipationChange,
}: Props) {
  const benefit = computeAvisBenefit({
    cartePrice,
    resourcePrice,
    avitonValue,
    participationCost,
  });
  const benefitClass =
    benefit.value == null
      ? ""
      : benefit.value > 0
        ? "avis-benefit--positive"
        : benefit.value < 0
          ? "avis-benefit--negative"
          : "";

  return (
    <li className="avis-card">
      <header className="avis-head">
        <div className="avis-thumb">
          {avis.img ? (
            <img src={avis.img} alt="" />
          ) : (
            <span className="avis-thumb-placeholder" aria-hidden>
              🗺️
            </span>
          )}
        </div>
        <div className="avis-info">
          <span className="avis-name" title={avis.name}>
            {avis.name}
          </span>
          <div className="avis-tags">
            {avis.level != null && (
              <span className="avis-level">Niv. {avis.level}</span>
            )}
            <span className="avis-avitons">{avis.avitons} avitons</span>
          </div>
        </div>
      </header>

      <div className="avis-lines">
        <AvisLine
          variant="cost"
          label="Carte requise"
          name={avis.carteName}
          img={avis.carteImg}
          price={cartePrice}
        />
        <AvisLine
          variant="reward"
          label="Ressource obtenue"
          name={avis.resourceName}
          img={avis.resourceImg}
          price={resourcePrice}
        />
        {avitonValue > 0 && (
          <AvisLine
            variant="reward"
            label="Avitons"
            name={`${avis.avitons} avitons`}
            placeholder="🪙"
            price={avitonValue}
          />
        )}
        <div className="avis-line avis-line--cost">
          <div className="avis-line-icon">
            <span aria-hidden>🎟️</span>
          </div>
          <div className="avis-line-body">
            <span className="avis-line-label">Participation (spot)</span>
            <span className="avis-line-name">Frais pour ce spot</span>
          </div>
          <span className="avis-line-price avis-line-price-edit">
            <input
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              aria-label={`Participation pour ${avis.name}`}
              value={participationCost || ""}
              placeholder="0"
              onChange={(e) =>
                onParticipationChange?.(
                  Math.max(0, Math.round(Number(e.target.value) || 0)),
                )
              }
            />
            <span className="avis-line-unit">k</span>
          </span>
        </div>
      </div>

      <footer
        className={`avis-benefit ${benefitClass}`}
        title="Bénéfice = ressource + avitons − carte − participation."
      >
        <span className="avis-benefit-label">Bénéfice</span>
        <span className="avis-benefit-value">
          {benefit.complete ? formatKamasSigned(benefit.value) : "—"}
        </span>
      </footer>
    </li>
  );
}
