import type { AvisReward } from "../lib/avis";
import { formatKamas } from "../lib/format";

interface Props {
  avis: AvisReward;
  /** Tracked HDV price of the "Carte de …" hunt map you must buy, if known. */
  cartePrice?: number;
  /** Tracked HDV price of the resource inside the chest, if known. */
  resourcePrice?: number;
}

/** One priceable line: icon, label + item name, and price (or "—"). */
function AvisLine({
  variant,
  label,
  name,
  img,
  price,
}: {
  variant: "cost" | "reward";
  label: string;
  name?: string;
  img?: string;
  price?: number;
}) {
  return (
    <div className={`avis-line avis-line--${variant}`}>
      <div className="avis-line-icon">
        {img ? <img src={img} alt="" /> : <span aria-hidden>—</span>}
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

/** One avis de recherche: picture, name, level, avitons + carte cost / resource reward. */
export function AvisCard({ avis, cartePrice, resourcePrice }: Props) {
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
      </div>
    </li>
  );
}
