import type { AvisReward } from "../lib/avis";

/** One avis de recherche as a card: picture, name, level, aviton reward. */
export function AvisCard({ avis }: { avis: AvisReward }) {
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
      </div>
    </li>
  );
}
