/**
 * "Percepteurs" page model: a repertoire of Dofus zones where you drop a
 * percepteur, to see which ones pay best. For each zone you note the loot value
 * (rendement), how long the percepteur sat there (minutes), and the potion cost
 * to go collect it — the potion cost is per-zone because it varies. From that we
 * derive kamas/hour and the net kamas/hour after the potion.
 */

/** One repertoried zone with its observed percepteur run. */
export interface PercepteurRow {
  id: string;
  /** Zone / sous-zone name (free text; the page autocompletes from past entries). */
  zone: string;
  /** A percepteur is currently placed here (a live marker, ⭐). */
  posed?: boolean;
  /** Time the percepteur was placed / the collection window, in minutes. */
  minutes?: number;
  /** Loot value collected, in kamas. */
  rendement?: number;
  /** Potion cost to go collect this zone, in kamas (varies by zone). */
  potion?: number;
}

/** Persisted page state: the rows plus the learned zone names for autocomplete. */
export interface PercepteurInput {
  rows: PercepteurRow[];
  /** Every zone name typed so far, so the autocomplete remembers them (offline). */
  zones: string[];
}

/** One row costed into per-hour figures. */
export interface PercepteurResult {
  row: PercepteurRow;
  /** Gross rendement per hour; undefined without a time or rendement. */
  perHour?: number;
  /** rendement − potion; undefined without a rendement. */
  net?: number;
  /** Net per hour (potion deducted); undefined without a usable time. Higher is better. */
  netPerHour?: number;
}

/** Cost one zone into gross/net per-hour figures. */
export function evaluatePercepteur(row: PercepteurRow): PercepteurResult {
  const { minutes, rendement, potion } = row;
  const hours = minutes != null && minutes > 0 ? minutes / 60 : undefined;
  const perHour =
    hours != null && rendement != null ? rendement / hours : undefined;
  const net = rendement != null ? rendement - (potion ?? 0) : undefined;
  const netPerHour = hours != null && net != null ? net / hours : undefined;
  return { row, perHour, net, netPerHour };
}

/** The best zone by net kamas/hour, ignoring rows that can't be costed yet. */
export function bestByNetPerHour(
  results: PercepteurResult[],
): PercepteurResult | undefined {
  let best: PercepteurResult | undefined;
  for (const r of results) {
    if (r.netPerHour == null) continue;
    if (!best || r.netPerHour > best.netPerHour!) best = r;
  }
  return best;
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh, empty zone row. */
export function newPercepteurRow(): PercepteurRow {
  return { id: makeId(), zone: "" };
}

/**
 * Add a zone name to the remembered list (trimmed, case-insensitive dedupe),
 * so it shows up in the autocomplete next time. Empty names are ignored.
 */
export function rememberZone(zones: string[], zone: string): string[] {
  const name = zone.trim();
  if (!name) return zones;
  const exists = zones.some((z) => z.toLowerCase() === name.toLowerCase());
  return exists ? zones : [...zones, name];
}

// --- Persistence -----------------------------------------------------------

const KEY = "dofus-efficiency:percepteur:v1";

function isRow(x: unknown): x is PercepteurRow {
  if (!x || typeof x !== "object") return false;
  const r = x as PercepteurRow;
  return typeof r.id === "string" && typeof r.zone === "string";
}

export function loadPercepteur(): PercepteurInput {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { rows: [], zones: [] };
    const parsed = JSON.parse(raw) as Partial<PercepteurInput>;
    const rows = Array.isArray(parsed.rows) ? parsed.rows.filter(isRow) : [];
    const zones = Array.isArray(parsed.zones)
      ? parsed.zones.filter((z): z is string => typeof z === "string")
      : [];
    return { rows, zones };
  } catch {
    return { rows: [], zones: [] };
  }
}

export function savePercepteur(input: PercepteurInput): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // non-fatal (quota / private mode)
  }
}
