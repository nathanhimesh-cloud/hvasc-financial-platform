import type { FinancialSnapshot, AgedSchedule, CommitmentLine, Commitments } from "@/lib/types";

/**
 * Working capital — money in flight (Build Brief B4 + C4).
 *
 * Four things the CFO can't see anywhere else in Practical without running four
 * separate reports:
 *
 *   1. COMMITMENTS  — ordered but not yet invoiced. Money already spent in every
 *      sense that matters, but absent from the ledger.
 *   2. WORK IN PROGRESS — capital spend accumulating on projects not yet complete.
 *   3. RECEIVABLES — owed to the Council, and how overdue.
 *   4. PAYABLES — owed by the Council.
 *
 * The interesting number at Hope Vale is (3): 65% of everything owed to them is
 * more than 90 days old, which is a collections problem, not a rounding artefact.
 */

/** Debt this old is a collections problem, not a timing difference. */
const OVERDUE_BUCKET = 90;

/** Above this share of receivables sitting in 90+, the ageing profile is flagged. */
const OVERDUE_ALARM = 0.4;

export interface AgeingInsight {
  schedule: AgedSchedule;
  /** Share of the total sitting in the 90+ bucket, 0–1. Null when nothing is owed. */
  overdueShare: number | null;
  /** True when an unusual share of the book is 90+ days old. */
  alarming: boolean;
}

function insightFor(schedule: AgedSchedule | undefined): AgeingInsight | null {
  if (!schedule) return null;
  const overdueShare = schedule.total > 0 ? schedule.days90 / schedule.total : null;
  return {
    schedule,
    overdueShare,
    alarming: overdueShare !== null && overdueShare > OVERDUE_ALARM,
  };
}

export interface WorkingCapital {
  /** Ordered, not yet invoiced. Null when the feed doesn't carry it. */
  commitments: Commitments | null;
  /** Capital projects still accumulating spend. */
  workInProgress: { code: string; project: string; amount: number }[];
  workInProgressTotal: number;
  receivables: AgeingInsight | null;
  payables: AgeingInsight | null;
  /** True when nothing in this view is populated — the feed needs a resync. */
  needsResync: boolean;
}

export function assessWorkingCapital(snapshot: FinancialSnapshot): WorkingCapital {
  const commitments = snapshot.commitments ?? null;
  const wip = snapshot.assets?.workInProgress ?? [];

  return {
    commitments,
    workInProgress: wip,
    workInProgressTotal: snapshot.assets?.workInProgressTotal ?? 0,
    receivables: insightFor(snapshot.ageing?.receivables),
    payables: insightFor(snapshot.ageing?.payables),
    needsResync: !commitments && !snapshot.ageing,
  };
}

export const OVERDUE_DAYS = OVERDUE_BUCKET;

/** Group open orders by supplier — who the Council owes the most future money to. */
export function commitmentsBySupplier(
  lines: CommitmentLine[],
): { supplier: string; amount: number; count: number }[] {
  const map = new Map<string, { supplier: string; amount: number; count: number }>();
  for (const l of lines) {
    const key = l.supplier || "(no supplier)";
    const e = map.get(key) ?? { supplier: key, amount: 0, count: 0 };
    e.amount += l.amount;
    e.count += 1;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
