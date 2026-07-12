"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { ReportScope } from "@/lib/monthly-report";

/**
 * Report-scope selector. Writes the choice to the URL (?report=<scope>) so the
 * selected pack is shareable and survives a refresh, and keeps any period the
 * page already has. The report itself renders server-side from the URL.
 */
export function MonthlyReportPicker({
  scopes,
  selected,
}: {
  scopes: { id: ReportScope; label: string }[];
  selected: ReportScope;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const go = (id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("report", id);
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  };

  return (
    <div className="no-print flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Report</span>
      <div className="flex flex-wrap gap-1">
        {scopes.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className={
              "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
              (s.id === selected
                ? "border-gold/40 bg-gold-dim text-gold-light"
                : "border-border bg-elevated text-muted-foreground hover:text-foreground")
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" strokeWidth={2} />}
    </div>
  );
}
