import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item, PriceMap, Recipe } from "./types";
import type { CraftDataset } from "./data/dofusApi";
import type { ScreenshotFile } from "./lib/medalFolder";
import {
  SAMPLE_ITEMS,
  SAMPLE_PRICES,
  SAMPLE_RECIPES,
} from "./data/sampleData";
import { rankRecipes } from "./lib/craft";
import {
  loadDataset,
  loadLastSource,
  loadPrices,
  savePrices,
  saveLastSource,
} from "./lib/storage";
import { PriceEditor } from "./components/PriceEditor";
import { CraftTable } from "./components/CraftTable";
import {
  DataSourcePanel,
  type SourceKind,
} from "./components/DataSourcePanel";
import { MedalFolderPicker } from "./components/MedalFolderPicker";
import { ScreenshotList } from "./components/ScreenshotList";

interface Dataset {
  kind: SourceKind;
  items: Item[];
  recipes: Recipe[];
}

const SAMPLE_DATASET: Dataset = {
  kind: "sample",
  items: SAMPLE_ITEMS,
  recipes: SAMPLE_RECIPES,
};

/** Restore the last-used dataset (a cached DofusDB one) if there is one. */
function initialDataset(): Dataset {
  const last = loadLastSource();
  if (last && last.startsWith("dofusdb:")) {
    const cached = loadDataset(last);
    if (cached) {
      return { kind: "dofusdb", items: cached.items, recipes: cached.recipes };
    }
  }
  return SAMPLE_DATASET;
}

export function App() {
  const [dataset, setDataset] = useState<Dataset>(initialDataset);

  const itemsById = useMemo(
    () => new Map(dataset.items.map((i) => [i.id, i])),
    [dataset],
  );

  // Prices persist across sessions and across data sources (item ids don't
  // collide: sample ids are words, DofusDB ids are numeric).
  const [prices, setPrices] = useState<PriceMap>(
    () => loadPrices() ?? { ...SAMPLE_PRICES },
  );

  useEffect(() => {
    savePrices(prices);
  }, [prices]);

  const evaluations = useMemo(
    () => rankRecipes(dataset.recipes, dataset.items, prices),
    [dataset, prices],
  );

  function setPrice(itemId: string, price: number | undefined) {
    setPrices((prev) => ({ ...prev, [itemId]: price }));
  }

  function useSample() {
    setDataset(SAMPLE_DATASET);
    saveLastSource("sample");
  }

  function useDofusDb(key: string, data: CraftDataset) {
    setDataset({ kind: "dofusdb", items: data.items, recipes: data.recipes });
    saveLastSource(key);
  }

  // Screenshots read from the Medal folder — the raw material for OCR later.
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const handleScreenshots = useCallback(
    (files: ScreenshotFile[]) => setScreenshots(files),
    [],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Dofus Efficiency</h1>
        <p className="tagline">Quel craft rapporte le plus, maintenant ?</p>
      </header>

      <main className="layout">
        <CraftTable evaluations={evaluations} itemsById={itemsById} />
        <div>
          <DataSourcePanel
            active={dataset.kind}
            itemCount={dataset.items.length}
            recipeCount={dataset.recipes.length}
            onUseSample={useSample}
            onLoaded={useDofusDb}
          />
          <MedalFolderPicker onScreenshots={handleScreenshots} />
          <PriceEditor
            items={dataset.items}
            prices={prices}
            onChange={setPrice}
          />
        </div>
      </main>

      <ScreenshotList files={screenshots} />

      <footer className="app-footer">
        <p>
          Données d'objets/recettes : exemples intégrés ou API DofusDB. Les prix
          viendront un jour des captures Medal (OCR).
        </p>
      </footer>
    </div>
  );
}
