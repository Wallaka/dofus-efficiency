import { useCallback, useEffect, useState } from "react";
import type { Item } from "../types";
import { loadFavourites, saveFavourites } from "./storage";

/**
 * The favourites "lite DB": a persisted list of items the user tracks.
 * Backed by localStorage; the rest of the app just calls add/remove/toggle.
 */
export function useFavourites() {
  const [favourites, setFavourites] = useState<Item[]>(() => loadFavourites());

  useEffect(() => {
    saveFavourites(favourites);
  }, [favourites]);

  const isFavourite = useCallback(
    (id: string) => favourites.some((f) => f.id === id),
    [favourites],
  );

  const add = useCallback((item: Item) => {
    setFavourites((prev) =>
      prev.some((f) => f.id === item.id) ? prev : [...prev, item],
    );
  }, []);

  const remove = useCallback((id: string) => {
    setFavourites((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggle = useCallback((item: Item) => {
    setFavourites((prev) =>
      prev.some((f) => f.id === item.id)
        ? prev.filter((f) => f.id !== item.id)
        : [...prev, item],
    );
  }, []);

  return { favourites, isFavourite, add, remove, toggle };
}
