import type { AccountRef, RevenueLine } from "@/lib/types";

/**
 * Headline revenue composition (Aug 2026 dashboard review). Micah asked for the
 * operating position to show WHERE the income comes from, in these buckets:
 * operating grants, capital grants, enterprise revenue, interest income, and
 * other income — not just one total against expenses.
 *
 * Classification is by ACCOUNT NAME, tuned against Hope Vale's actual chart
 * (434 accounts, live snapshot Aug 2026). The council's income-statement
 * roll-ups ("Corporate Services revenue" etc.) are BY DIRECTORATE, not by type,
 * so the dashboard prefers the per-account chart when the snapshot ships it —
 * see `revenueLinesFromAccounts`. The rules are deliberately visible below;
 * anything they don't recognise lands in "Other income" instead of being
 * silently mis-filed, and the bucket sum is reconciled to total income so
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

/**
 * Capital-works funding. Hope Vale's capital grant revenue accounts are mostly
 * NAMED AFTER THE WORKS ("Springhill Road", "Everlina Bridge Deck Replacement",
 * "ROOF PROGRAM REVENUE") rather than containing the word "grant", plus the
 * program acronyms: ICCIP, R2R / Roads to Recovery, LCRI, QRRRF, QRA
 * Betterment, NDRRA restoration subs, Remote Capital, Growing Regions.
 */
const CAPITAL =
  /capital|ICCIP|R2R|roads to recovery|LCRI|QRRRF|betterment|NDRRA|\bQRA\b|growing regions|remote capital|crucial access|bridge|footpath|upgrade|renovation|roof program|housing scheme|\broad\b|\brd\b/i;

/** Operating grants, subsidies, contributions and donations. */
const GRANT =
  /grant|subsid|funding|contribut|donat|assistance|allocation|recurrent|FAGS|HACC|QCSS|SGFA|C&K/i;

const INTEREST = /interest/i;

/**
 * Council enterprises and user charges: the store, bakery, butcher, service
 * station, workshop, post office, plant hire, leases and rents, hall/room hire,
 * fees, licences, utility and commercial charges, aged-persons hostel income.
 */
const ENTERPRISE =
  /sale|lease|rent|hire|\bfee\b|fees|charge|licen[cs]e|bakery|butcher|foodstore|food store|service station|workshop|post office|agency|power cards|banana|rodeo|events|private works|contract works|recovery|\bAPH\b|hostel|benefit|utility|commercial|centrelink/i;

function classify(label: string): RevenueBucketKey {
  if (CAPITAL.test(label)) return "capital-grants";
  if (GRANT.test(label)) return "operating-grants";
  if (INTEREST.test(label)) return "interest";
  if (ENTERPRISE.test(label)) return "enterprise";
  return "other";
}

const LABELS: Record<RevenueBucketKey, string> = {
  "operating-grants": "Operating grants & subsidies",
  "capital-grants": "Capital grants & works funding",
  enterprise: "Enterprise & user charges",
  interest: "Interest income",
  other: "Other income",
};

const ORDER: RevenueBucketKey[] = ["operating-grants", "capital-grants", "enterprise", "interest", "other"];

/**
 * The per-account revenue chart as RevenueLine[], for classification. The
 * directorate roll-up lines can't be split by type; the chart can. Zero-balance
 * accounts are dropped (early in the FY that's most of them).
 */
export function revenueLinesFromAccounts(accounts: AccountRef[]): RevenueLine[] {
  return accounts
    .filter((a) => a.kind === "revenue" && Math.abs(a.balance) > 0.005)
    .map((a) => ({ id: a.code, label: a.name, ytd: a.balance }));
}

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
