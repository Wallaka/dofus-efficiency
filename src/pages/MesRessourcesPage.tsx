import { useMemo, useState } from "react";
import type { Item } from "../types";
import { ItemAutocomplete } from "../components/ItemAutocomplete";
import {
  loadResources,
  saveResources,
  type ResourceMap,
} from "../lib/resources";

/**
 * "Mes ressources": the player's stock. Search a resource, set a quantity, add
 * it. When "Utiliser mes ressources" is on (Craft pages), these quantities are
 * deducted from ingredient costs so the cost shown is what's left to buy.
 */
export function MesRessourcesPage() {
  const [resources, setResources] = useState<ResourceMap>(loadResources);
  const [pending, setPending] = useState<Item | null>(null);
  const [qty, setQty] = useState("1");

  function persist(next: ResourceMap) {
    setResources(next);
    saveResources(next);
  }

  function addPending() {
    if (!pending) return;
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    const current = resources[pending.id]?.quantity ?? 0;
    persist({
      ...resources,
      [pending.id]: { item: pending, quantity: current + n },
    });
    setPending(null);
    setQty("1");
  }

  function setQuantity(id: string, v: string) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 1) return; // ignore empty/invalid; ✕ removes
    persist({ ...resources, [id]: { ...resources[id], quantity: n } });
  }

  function remove(id: string) {
    const next = { ...resources };
    delete next[id];
    persist(next);
  }

  const rows = useMemo(
    () =>
      Object.values(resources).sort((a, b) =>
        a.item.name.localeCompare(b.item.name, "fr"),
      ),
    [resources],
  );

  return (
    <section className="panel res-page">
      <h2>Mes ressources</h2>
      <p className="hint">
        Ce que vous avez déjà en stock. Activez «&nbsp;Utiliser mes
        ressources&nbsp;» sur la page Craft pour déduire ces quantités du coût de
        craft — le coût affiché devient ce qu'il reste à acheter.
      </p>

      <div className="res-add">
        {pending ? (
          <span className="res-pending">
            {pending.img && <img src={pending.img} alt="" className="res-ic-img" />}
            <span className="res-pending-name">{pending.name}</span>
            <button
              type="button"
              className="res-pending-clear"
              onClick={() => setPending(null)}
              aria-label="Changer d'objet"
            >
              ✕
            </button>
          </span>
        ) : (
          <ItemAutocomplete
            onPick={setPending}
            placeholder="Rechercher une ressource…"
          />
        )}
        <input
          type="number"
          min={1}
          className="res-add-qty"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addPending();
          }}
          aria-label="Quantité"
        />
        <button
          type="button"
          className="folder-pick"
          onClick={addPending}
          disabled={!pending}
        >
          Ajouter
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="hint res-empty">
          Aucune ressource en stock. Cherchez-en une ci-dessus pour l'ajouter.
        </p>
      ) : (
        <ul className="res-list">
          {rows.map(({ item, quantity }) => (
            <li key={item.id} className="res-row">
              <span className="res-ic">
                {item.img ? (
                  <img src={item.img} alt="" />
                ) : (
                  <span aria-hidden>▪</span>
                )}
              </span>
              <span className="res-name" title={item.name}>
                {item.name}
              </span>
              <input
                type="number"
                min={1}
                className="res-qty"
                inputMode="numeric"
                defaultValue={quantity}
                key={`${item.id}:${quantity}`}
                onBlur={(e) => setQuantity(item.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                aria-label={`Quantité de ${item.name}`}
              />
              <button
                type="button"
                className="folder-secondary res-del"
                onClick={() => remove(item.id)}
                aria-label={`Retirer ${item.name}`}
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
