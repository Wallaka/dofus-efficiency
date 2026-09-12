import type { AvisReward } from "../lib/avis";
import { formatKamas } from "../lib/format";

interface Props {
  avis: AvisReward;
  /** Tracked HDV price of the chest (resource), if known. */
  chestPrice?: number;
}

/** One avis de recherche: picture, name, level, avitons, chest resource. */
export function AvisCard({ avis, chestPrice }: Props) {
  return (
    <li className="avis-card">
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
        {avis.chestName && (
          <div className="avis-resource" title={avis.chestName}>
            {avis.chestImg && (
              <img src={avis.chestImg} alt="" className="avis-resource-icon" />
            )}
            <span className="avis-resource-name">{avis.chestName}</span>
            <span className="avis-resource-price">
              {chestPrice != null ? formatKamas(chestPrice) : "—"}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}
