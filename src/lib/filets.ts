/**
 * Capture nets ("filets de capture") for wild mounts, hardcoded from DofusDB
 * (item type 99). The API exposes each filet's id, name, level and icon, but
 * NOT how many mounts it yields per capture — every filet shares the same
 * generic effect id, and even the level-1 universal net (1 mount) carries it.
 * So `defaultMounts` below is a best-guess read from the item's description
 * ("multiplicateur" duplicates, "renforcé" catches several); it seeds the
 * editable "montures / capture" field and the user confirms the real value.
 *
 * `level` is the DofusDB item level, treated as the éleveur level required to
 * use the filet — which is what the level-filtered picker keys off.
 */

export type FiletCreature = "Universel" | "Dragodinde" | "Volkorne" | "Muldo";

export interface FiletDef {
  /** DofusDB item id (as a string, matching the shared price map keys). */
  id: string;
  /** French name. */
  name: string;
  /** Éleveur level required to use it (from the DofusDB item level). */
  level: number;
  /** Icon URL. */
  img: string;
  /** Which wild mount it targets ("Universel" = any). */
  creature: FiletCreature;
  /** Best-guess average mounts obtained per capture — editable in the UI. */
  defaultMounts: number;
}

const IMG = (icon: number) => `https://api.dofusdb.fr/img/items/${icon}.png`;

export const FILETS: FiletDef[] = [
  {
    id: "32521",
    name: "Filet de capture universel",
    level: 1,
    img: IMG(99004),
    creature: "Universel",
    defaultMounts: 1,
  },
  // Multiplicateur (niv 100) — duplique la monture capturée.
  {
    id: "32525",
    name: "Filet multiplicateur de Dragodinde",
    level: 100,
    img: IMG(99010),
    creature: "Dragodinde",
    defaultMounts: 2,
  },
  {
    id: "32526",
    name: "Filet multiplicateur de Volkorne",
    level: 100,
    img: IMG(99009),
    creature: "Volkorne",
    defaultMounts: 2,
  },
  {
    id: "32527",
    name: "Filet multiplicateur de Muldo",
    level: 100,
    img: IMG(99008),
    creature: "Muldo",
    defaultMounts: 2,
  },
  // « À X renforcé » (niv 150) — capture plusieurs sauvages d'un coup.
  {
    id: "32522",
    name: "Filet à Dragodinde renforcé",
    level: 150,
    img: IMG(99007),
    creature: "Dragodinde",
    defaultMounts: 3,
  },
  {
    id: "32523",
    name: "Filet à Volkorne renforcé",
    level: 150,
    img: IMG(99006),
    creature: "Volkorne",
    defaultMounts: 3,
  },
  {
    id: "32524",
    name: "Filet à Muldo renforcé",
    level: 150,
    img: IMG(99005),
    creature: "Muldo",
    defaultMounts: 3,
  },
  // Multiplicateur renforcé (niv 200) — capture plusieurs ET duplique.
  {
    id: "32528",
    name: "Filet multiplicateur de Dragodinde renforcé",
    level: 200,
    img: IMG(99013),
    creature: "Dragodinde",
    defaultMounts: 6,
  },
  {
    id: "32529",
    name: "Filet multiplicateur de Volkorne renforcé",
    level: 200,
    img: IMG(99012),
    creature: "Volkorne",
    defaultMounts: 6,
  },
  {
    id: "32530",
    name: "Filet multiplicateur de Muldo renforcé",
    level: 200,
    img: IMG(99011),
    creature: "Muldo",
    defaultMounts: 6,
  },
];

const byId = new Map(FILETS.map((f) => [f.id, f]));

/** Look up a filet definition by id. */
export function filetById(id: string | undefined): FiletDef | undefined {
  return id == null ? undefined : byId.get(id);
}

/**
 * The filets usable at a given éleveur level (requirement ≤ level), sorted by
 * level then name. Below level 1 this is empty. When `creature` is given, only
 * that creature's filets and the universal net are kept.
 */
export function filetsForLevel(
  level: number | undefined,
  creature?: FiletCreature,
): FiletDef[] {
  const lvl = level ?? 0;
  return FILETS.filter(
    (f) =>
      f.level <= lvl &&
      (creature == null ||
        f.creature === "Universel" ||
        f.creature === creature),
  ).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "fr"));
}
