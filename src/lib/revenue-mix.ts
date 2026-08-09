import type { RevenueLine } from "@/lib/types";

/**
 * Headline revenue composition (Aug 2026 dashboard review). Micah asked for the
 * operating position to show WHERE the income comes from, in these buckets:
 * operating grants, capital grants, enterprise revenue, interest income, and
 * other income — not just one total against expenses.
 *
 * Classification is by revenue-line NAME, because that's what the income
 * statement gives us. The rules are deliberately visible below rather than
 * buried; anything the rules don't recognise lands in "Other income" instead of
 * being silently mis-filed, and the bucket sum is reconciled to total income so
 * nothing can go missing.
 */

export type RevenueBucketKey = "operating-grants" | "capital-grants" | "enterprise" | "interest" | "other";

export interface RevenueBucket {
  key: RevenueBucketKey;
  label: string;
  amount: number;
  /** Share of total income (0–1). */
  share: number;
  /** How many revenue lines landed here. */
  lineCount: number;
}

const GRANT = /grant|subsid|contribut/i;
const CAPITAL = /capital/i;
const INTEREST = /interest|investment/i;
const ENTERPRISE = /enterprise|sale|fee|charge|rent|lease|hire|contract|store|shop|fuel|accommodation|canteen|bakery|caf|airport|post/i;

function classify(label: string): RevenueBucketKey {
  if (CAPITAL.test(label) && GRANT.test(label)) return "capital-grants";
  if (GRANT.test(label)) return "operating-grants";
  if (INTEREST.test(label)) return "interest";
  if (ENTERPRISE.test(label)) return "enterprise";
  return "other";
}

const LABELS: Record<RevenueBucketKey, string> = {
  "operating-grants": "Operating grants & subsidies",
  "capital-grants": "Capital grants",
  enterprise: "Enterprise revenue",
  interest: "Interest income",
  other: "Other income",
};

const ORDER: RevenueBucketKey[] = ["operating-grants", "capital-grants", "enterprise", "interest", "other"];

/**
 * Fold revenue lines into the five buckets. `totalIncome` is the statement's
 * own total for the same period; any difference between it and the line sum
 * (rounding, an unitemised line) is put in "Other income" so the buckets always
 * add back to the headline figure.
 */
export function revenueComposition(lines: RevenueLine[], totalIncome: number): RevenueBucket[] {
  const amounts = new Map<RevenueBucketKey, { amount: number; lineCount: number }>();
  for (const key of ORDER) amounts.set(key, { amount: 0, lineCount: 0 });

  for (const line of lines) {
    const slot = amounts.get(classify(line.label))!;
    slot.amount += line.ytd;
    slot.lineCount += 1;
  }

  // Reconcile to the statement total — the residual belongs in Other, not nowhere.
  const lineSum = lines.reduce((a, l) => a + l.ytd, 0);
  const residual = totalIncome - lineSum;
  if (Math.abs(residual) > 0.5) amounts.get("other")!.amount += residual;

  const total = totalIncome !== 0 ? totalIncome : lineSum;
  return ORDER.map((key) => {
    const { amount, lineCount } = amounts.get(key)!;
    return {
      key,
      label: LABELS[key],
      amount,
      share: total !== 0 ? amount / total : 0,
      lineCount,
    };
  });
}
