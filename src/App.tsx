import { useEffect, useMemo, useState } from "react";
import type { PriceMap } from "./types";
import {
  SAMPLE_ITEMS,
  SAMPLE_PRICES,
  SAMPLE_RECIPES,
} from "./data/sampleData";
import { rankRecipes } from "./lib/craft";
import { loadPrices, savePrices } from "./lib/storage";
import { PriceEditor } from "./components/PriceEditor";
import { CraftTable } from "./components/CraftTable";
import { MedalFolderPicker } from "./components/MedalFolderPicker";

export function App() {
  // Static data — bundled sample for Phase 0; DofusDB later (see data/dofusApi.ts).
  const items = SAMPLE_ITEMS;
  const recipes = SAMPLE_RECIPES;
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  // Dynamic data — the prices, persisted locally between sessions.
  const [prices, setPrices] = useState<PriceMap>(
    () => loadPrices() ?? { ...SAMPLE_PRICES },
  );

  useEffect(() => {
    savePrices(prices);
  }, [prices]);

  const evaluations = useMemo(
    () => rankRecipes(recipes, items, prices),
    [recipes, items, prices],
  );

  function setPrice(itemId: string, price: number | undefined) {
    setPrices((prev) => ({ ...prev, [itemId]: price }));
  }

  function resetToSample() {
    setPrices({ ...SAMPLE_PRICES });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Dofus Efficiency</h1>
        <p className="tagline">
          Quel craft rapporte le plus, maintenant ? — Phase 0 (données d'exemple)
        </p>
      </header>

      <main className="layout">
        <CraftTable evaluations={evaluations} itemsById={itemsById} />
        <div>
          <MedalFolderPicker />
          <PriceEditor items={items} prices={prices} onChange={setPrice} />
          <button type="button" className="reset" onClick={resetToSample}>
            Réinitialiser les prix d'exemple
          </button>
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Données d'objets/recettes : exemples intégrés pour l'instant. La vraie
          liste viendra de l'API DofusDB, et les prix des captures Medal (OCR).
        </p>
      </footer>
    </div>
  );
}
