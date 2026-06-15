/** Number / currency formatting helpers used across the app. */

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/** Full currency, e.g. 1640000 → "$1,640,000". */
export function formatCurrency(value: number): string {
  const sign = value < 0 ? "−" : "";
  return sign + AUD.format(Math.abs(value));
}

/** Compact currency, e.g. 4820000 → "$4.82M", 882000 → "$882K". */
export function formatCompact(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${abs}`;
}

/** Signed compact currency, e.g. 143000 → "+$143K", -384000 → "−$384K". */
export function formatSignedCompact(value: number): string {
  const sign = value < 0 ? "−" : "+";
  return `${sign}$${formatCompact(Math.abs(value)).replace("$", "")}`;
}

/** Percentage from a 0–1 ratio, e.g. 0.651 → "65%". */
export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}
