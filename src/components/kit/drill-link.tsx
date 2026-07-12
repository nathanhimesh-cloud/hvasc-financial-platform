"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Click a number, see the transactions behind it (Build Brief B3).
 *
 * The brief lists this as one of the six things the finished platform does:
 * "Click a total and see the individual transactions behind it (date, description,
 * document number, amounts)."
 *
 * The database work for this was already done — `queryTransactions` has taken a
 * `code` filter (prefix-matched, applied in Postgres) since the ledger was built.
 * All that was missing was a link.
 *
 * The GL code is a PREFIX, deliberately. "1255-2000" drills into every sub-account
 * beneath it, which is how a reader thinks about an account: they want the
 * department's salaries, not one specific ledger line.
 *
 * The selected period travels with the link, so drilling from an archived month
 * lands on that month's transactions rather than today's.
 */
export function DrillLink({
  code,
  children,
  className,
  title,
}: {
  /** GL account code, or a prefix of one. */
  code: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const params = useSearchParams();

  const q = new URLSearchParams();
  q.set("code", code);
  // Carry the period, so an archived figure drills into the archived period.
  const fy = params.get("fy");
  const m = params.get("m");
  if (fy) q.set("fy", fy);
  if (m) q.set("m", m);

  return (
    <Link
      href={`/transactions?${q.toString()}`}
      title={title ?? `See the transactions behind ${code}`}
      className={cn(
        "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4",
        "transition-colors hover:decoration-gold hover:text-gold-light",
        className,
      )}
    >
      {children}
    </Link>
  );
}
