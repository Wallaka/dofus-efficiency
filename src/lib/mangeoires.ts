/**
 * Mangeoire "fuel" consumables (DofusDB type 326, "Carburant d'enclos"). Each
 * one is a battery that adds a fixed amount of energy to an enclos's mangeoire
 * gauge; the mounts consume that energy to gain xp (1 xp/s) up to the level
 * needed for brisage.
 *
 * The energy (confirmed from the item effect value / description "recharger …
 * de X") depends only on the size, identically across the four families:
 *   Minuscule 1000 · Petit(e) 2000 · (base) 3000 · Grand(e) 4000 · Gigantesque 5000
 * The families (Extrait/Philtre/Potion/Élixir) differ by level requirement and
 * gauge cap, not by energy — so any of them can fill the ~39 360 we need.
 *
 * Ids/icons are from the built-in catalog; prices come from the shared store.
 */

const IMG = (icon: number) => `https://api.dofusdb.fr/img/items/${icon}.png`;

export interface MangeoireDef {
  /** DofusDB item id (string, matching the shared price map keys). */
  id: string;
  /** French name. */
  name: string;
  /** Item level (informational; roughly the tier). */
  level: number;
  /** Icon URL. */
  img: string;
  /** Energy added to the enclos mangeoire gauge (the "battery"). */
  energy: number;
}

export const MANGEOIRES: MangeoireDef[] = [
  { id: "33314", name: "Minuscule Extrait de Mangeoire", level: 5, img: IMG(93202), energy: 1000 },
  { id: "33320", name: "Petit Extrait de Mangeoire", level: 15, img: IMG(93226), energy: 2000 },
  { id: "33331", name: "Extrait de Mangeoire", level: 25, img: IMG(93142), energy: 3000 },
  { id: "33341", name: "Grand Extrait de Mangeoire", level: 35, img: IMG(93178), energy: 4000 },
  { id: "33352", name: "Gigantesque Extrait de Mangeoire", level: 45, img: IMG(93154), energy: 5000 },
  { id: "33362", name: "Minuscule Philtre de Mangeoire", level: 55, img: IMG(93208), energy: 1000 },
  { id: "33373", name: "Petit Philtre de Mangeoire", level: 65, img: IMG(93232), energy: 2000 },
  { id: "33383", name: "Philtre de Mangeoire", level: 75, img: IMG(93244), energy: 3000 },
  { id: "33394", name: "Grand Philtre de Mangeoire", level: 85, img: IMG(93184), energy: 4000 },
  { id: "33404", name: "Gigantesque Philtre de Mangeoire", level: 95, img: IMG(93160), energy: 5000 },
  { id: "33415", name: "Minuscule Potion de Mangeoire", level: 105, img: IMG(93214), energy: 1000 },
  { id: "33425", name: "Petite Potion de Mangeoire", level: 115, img: IMG(93238), energy: 2000 },
  { id: "33436", name: "Potion de Mangeoire", level: 125, img: IMG(93250), energy: 3000 },
  { id: "33446", name: "Grande Potion de Mangeoire", level: 135, img: IMG(93190), energy: 4000 },
  { id: "33457", name: "Gigantesque Potion de Mangeoire", level: 145, img: IMG(93166), energy: 5000 },
  { id: "33467", name: "Minuscule Élixir de Mangeoire", level: 155, img: IMG(93196), energy: 1000 },
  { id: "33476", name: "Petit Élixir de Mangeoire", level: 165, img: IMG(93220), energy: 2000 },
  { id: "33485", name: "Élixir de Mangeoire", level: 175, img: IMG(93136), energy: 3000 },
  { id: "33494", name: "Grand Élixir de Mangeoire", level: 185, img: IMG(93172), energy: 4000 },
  { id: "33503", name: "Gigantesque Élixir de Mangeoire", level: 195, img: IMG(93148), energy: 5000 },
];

const byId = new Map(MANGEOIRES.map((m) => [m.id, m]));

/** Look up a mangeoire definition by id. */
export function mangeoireById(id: string | undefined): MangeoireDef | undefined {
  return id == null ? undefined : byId.get(id);
}
