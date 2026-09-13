import type { AvisReward } from "../lib/avis";
import { computeAvisBenefit } from "../lib/avis";
import { formatKamas, formatKamasSigned } from "../lib/format";

interface Props {
  avis: AvisReward;
  /** Tracked HDV price of the "Carte de …" hunt map you must buy, if known. */
  cartePrice?: number;
  /** Tracked HDV price of the resource inside the chest, if known. */
  resourcePrice?: number;
  /** Optional flat fee paid to join a hunt "spot", applied to every avis. */
  participationCost?: number;
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

/** One avis de recherche: picture, name, level, avitons + carte cost / resource reward / benefit. */
export function AvisCard({
  avis,
  cartePrice,
  resourcePrice,
  participationCost = 0,
}: Props) {
  const benefit = computeAvisBenefit({
    cartePrice,
    resourcePrice,
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
        {participationCost > 0 && (
          <AvisLine
            variant="cost"
            label="Participation (spot)"
            name="Frais de participation"
            placeholder="🎟️"
            price={participationCost}
          />
        )}
      </div>

      <footer
        className={`avis-benefit ${benefitClass}`}
        title="Bénéfice = ressource vendue − carte − participation. Les avitons ne sont pas encore comptés."
      >
        <span className="avis-benefit-label">Bénéfice</span>
        <span className="avis-benefit-value">
          {benefit.complete ? formatKamasSigned(benefit.value) : "—"}
        </span>
      </footer>
    </li>
  );
}
