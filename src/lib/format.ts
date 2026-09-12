/** Format a kamas amount with thousands separators, e.g. 12345 -> "12 345 k". */
export function formatKamas(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  const withSep = rounded.toLocaleString("fr-FR").replace(/ /g, " ");
  return `${withSep} k`;
}

/** Format a ratio as a signed percentage, e.g. 0.25 -> "+25 %". */
export function formatPercent(ratio: number | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  const pct = Math.round(ratio * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct} %`;
}

/** Format a byte count, e.g. 1536 -> "1,5 Ko", 2_500_000 -> "2,4 Mo". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** Format a timestamp (ms since epoch) as a French date + time, e.g. "12 sept. 2026, 18:14". */
export function formatDateTime(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
