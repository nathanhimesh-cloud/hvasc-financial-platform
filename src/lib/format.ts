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

/**
 * The Australian financial year (Jul–Jun) a date falls in, e.g. "30 June 2025"
 * → "FY2024-25". Returns null if the date can't be parsed. Used to tag each
 * statement with its own year so a prior-year Balance Sheet / Cash Flow is never
 * silently presented under the current reporting year.
 */
export function financialYearOf(dateish: string | undefined | null): string | null {
  if (!dateish) return null;
  const d = new Date(dateish);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth(); // 0 = Jan … 6 = Jul
  const y = d.getFullYear();
  const startYear = m >= 6 ? y : y - 1; // FY starts in July
  const endYY = ((startYear + 1) % 100).toString().padStart(2, "0");
  return `FY${startYear}-${endYY}`;
}
