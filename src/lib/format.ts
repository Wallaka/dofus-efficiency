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
