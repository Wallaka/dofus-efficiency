import type { Item } from "../types";
import { ItemAutocomplete } from "./ItemAutocomplete";

interface Props {
  favourites: Item[];
  onAdd: (item: Item) => void;
  onRemove: (id: string) => void;
  isFavourite: (id: string) => boolean;
}

/**
 * The "objets suivis" panel: search DofusDB and pin items to a persisted
 * favourites list. Favourites also flow into the price editor for tracking.
 */
export function FavouritesPanel({
  favourites,
  onAdd,
  onRemove,
  isFavourite,
}: Props) {
  return (
    <section className="panel">
      <h2>Objets suivis</h2>
      <p className="hint">
        Cherchez un objet et épinglez-le pour suivre son prix, même hors du jeu
        de données courant.
      </p>

      <ItemAutocomplete
        onPick={onAdd}
        isPicked={isFavourite}
        placeholder="Rechercher un objet à suivre…"
      />

      {favourites.length === 0 ? (
        <p className="hint fav-empty">Aucun objet suivi pour l'instant.</p>
      ) : (
        <ul className="fav-list">
          {favourites.map((item) => (
            <li key={item.id} className="fav-row">
              {item.img && (
                <img src={item.img} alt="" className="fav-icon" />
              )}
              <span className="fav-name">{item.name}</span>
              {item.level != null && (
                <span className="fav-level">Niv. {item.level}</span>
              )}
              <button
                type="button"
                className="fav-remove"
                onClick={() => onRemove(item.id)}
                aria-label={`Retirer ${item.name}`}
                title="Retirer des suivis"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
