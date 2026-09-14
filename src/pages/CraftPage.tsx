import { useCallback, useMemo, useState } from "react";
import type { Item, Recipe } from "../types";
import type { CraftDataset } from "../data/dofusApi";
import type { ScreenshotFile } from "../lib/medalFolder";
import {
  SAMPLE_ITEMS,
  SAMPLE_PRICES,
  SAMPLE_RECIPES,
} from "../data/sampleData";
import { rankRecipes } from "../lib/craft";
import { loadDataset, loadLastSource, saveLastSource } from "../lib/storage";
import type { ApplyPrice } from "../lib/priceStore";
import { usePrices } from "../lib/usePrices";
import {
  loadResources,
  stockQuantities,
  loadUseMaterials,
  saveUseMaterials,
} from "../lib/resources";
import { useFavourites } from "../lib/useFavourites";
import { PriceEditor } from "../components/PriceEditor";
import { CraftTable } from "../components/CraftTable";
import {
  DataSourcePanel,
  type SourceKind,
} from "../components/DataSourcePanel";
import { FavouritesPanel } from "../components/FavouritesPanel";
import { MedalFolderPicker } from "../components/MedalFolderPicker";
import { ScreenshotList } from "../components/ScreenshotList";

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

/** The craft-profitability page: data source, prices, and the ranked table. */
export function CraftPage() {
  const [dataset, setDataset] = useState<Dataset>(initialDataset);

  const itemsById = useMemo(
    () => new Map(dataset.items.map((i) => [i.id, i])),
    [dataset],
  );

  // Prices come from the shared entry store (single source of truth). Sample
  // prices are demo defaults layered underneath for the sample dataset; real
  // item ids never collide (sample ids are words, DofusDB ids are numeric).
  const {
    prices: entryPrices,
    entries: priceEntries,
    setPrice: recordPrice,
    clearPrice: forgetPrice,
  } = usePrices();
  const prices = useMemo(
    () => ({ ...SAMPLE_PRICES, ...entryPrices }),
    [entryPrices],
  );

  // "Mes ressources": loaded once; deducted from costs when the toggle is on.
  const [resources] = useState(loadResources);
  const [useMaterials, setUseMaterials] = useState(loadUseMaterials);
  const stock = useMemo(
    () => (useMaterials ? stockQuantities(resources) : undefined),
    [useMaterials, resources],
  );
  function toggleMaterials(on: boolean) {
    setUseMaterials(on);
    saveUseMaterials(on);
  }

  const evaluations = useMemo(
    () => rankRecipes(dataset.recipes, dataset.items, prices, stock),
    [dataset, prices, stock],
  );

  // Item id → when its price was last recorded, for the craft table hints.
  const priceUpdatedAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of Object.values(priceEntries)) m.set(e.itemId, e.updatedAt);
    return m;
  }, [priceEntries]);

  // Manual edit from the price editor: stamp a "manuel" entry (or forget it).
  function setPrice(itemId: string, price: number | undefined) {
    if (price == null) {
      forgetPrice(itemId);
      return;
    }
    const item = priceItemsById.get(itemId) ?? { id: itemId, name: itemId };
    recordPrice(item, price);
  }

  // OCR feedback loop: store a screenshot-read price for the chosen item, along
  // with any per-quantity lot prices read from the same screen.
  const applyOcrPrice = useCallback<ApplyPrice>(
    (item, price, detail, extra) => {
      recordPrice(item, price, "ocr", detail, extra?.lots);
    },
    [recordPrice],
  );

  function useSample() {
    setDataset(SAMPLE_DATASET);
    saveLastSource("sample");
  }

  function useDofusDb(key: string, data: CraftDataset) {
    setDataset({ kind: "dofusdb", items: data.items, recipes: data.recipes });
    saveLastSource(key);
  }

  // Screenshots read from the Medal folder — the raw material for OCR.
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const handleScreenshots = useCallback(
    (files: ScreenshotFile[]) => setScreenshots(files),
    [],
  );

  // Favourites (the "lite DB") also flow into the price editor so their prices
  // are trackable even when they aren't part of the current dataset.
  const { favourites, isFavourite, add, remove } = useFavourites();

  const priceItems = useMemo(() => {
    const byId = new Map(dataset.items.map((i) => [i.id, i]));
    for (const fav of favourites) {
      if (!byId.has(fav.id)) byId.set(fav.id, fav);
    }
    return [...byId.values()];
  }, [dataset.items, favourites]);

  // Lookup used when stamping a manual price entry with the item's name/icon.
  const priceItemsById = useMemo(
    () => new Map(priceItems.map((i) => [i.id, i])),
    [priceItems],
  );

  return (
    <>
      <main className="layout">
        <CraftTable
          evaluations={evaluations}
          itemsById={itemsById}
          priceUpdatedAt={priceUpdatedAt}
        />
        <div>
          <label className="use-materials use-materials--standalone">
            <input
              type="checkbox"
              checked={useMaterials}
              onChange={(e) => toggleMaterials(e.target.checked)}
            />
            <span>
              <b>Utiliser mes ressources</b>
              <span className="hint">
                Déduit ton stock (page « Mes ressources ») du coût de craft.
              </span>
            </span>
          </label>
          <DataSourcePanel
            active={dataset.kind}
            itemCount={dataset.items.length}
            recipeCount={dataset.recipes.length}
            onUseSample={useSample}
            onLoaded={useDofusDb}
          />
          <FavouritesPanel
            favourites={favourites}
            onAdd={add}
            onRemove={remove}
            isFavourite={isFavourite}
          />
          <MedalFolderPicker onScreenshots={handleScreenshots} />
          <PriceEditor items={priceItems} prices={prices} onChange={setPrice} />
        </div>
      </main>

      <ScreenshotList files={screenshots} onApplyPrice={applyOcrPrice} />
    </>
  );
}
