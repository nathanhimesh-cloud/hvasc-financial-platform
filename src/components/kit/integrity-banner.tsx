import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Check,
  X,
  Minus,
  Clock,
} from "lucide-react";
import type { IntegrityReport, CheckStatus } from "@/lib/integrity";
import { integritySummary } from "@/lib/integrity";
import { cn } from "@/lib/utils";

/**
 * Reconciliation banner (Build Brief A4). Renders a clear red / amber / green
 * status over a report so a figure that fails its accuracy checks is never
 * presented as final. Purely presentational — the assessment is done in
 * `src/lib/integrity.ts`.
 */

const TONE = {
  fail: {
    box: "border-red/40 bg-red/10",
    text: "text-red",
    icon: ShieldAlert,
    title: "This report did not pass its accuracy checks",
  },
  partial: {
    box: "border-amber/40 bg-amber/10",
    text: "text-amber",
    icon: ShieldQuestion,
    title: "Accuracy checks are pending data",
  },
  pass: {
    box: "border-green/40 bg-green/10",
    text: "text-green",
    icon: ShieldCheck,
    title: "All accuracy checks passed",
  },
} as const;

function StatusMark({ status }: { status: CheckStatus }) {
  if (status === "pass") return <Check className="h-3.5 w-3.5 text-green" strokeWidth={2.5} />;
  if (status === "fail") return <X className="h-3.5 w-3.5 text-red" strokeWidth={2.5} />;
  return <Minus className="h-3.5 w-3.5 text-amber" strokeWidth={2.5} />;
}

export function IntegrityBanner({ report }: { report: IntegrityReport }) {
  const tone = TONE[report.status];
  const Icon = tone.icon;

  return (
    <div className={cn("rounded-lg border px-4 py-3", tone.box)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", tone.text)} strokeWidth={1.75} />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("text-[13px] font-semibold", tone.text)}>{tone.title}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {report.checkedCount}/{report.checks.length} checks run
            </span>
          </div>

          <ul className="flex flex-col gap-1.5">
            {report.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[12px]">
                <span className="mt-0.5 flex-shrink-0">
                  <StatusMark status={c.status} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-foreground">
                    {c.label}
                    {c.status === "fail" && c.reason && (
                      <span className="text-red"> — {c.reason}</span>
                    )}
                    {c.status === "not-checked" && c.reason && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {" — "}
                        <Clock className="h-3 w-3" strokeWidth={2} />
                        {c.reason}
                      </span>
                    )}
                  </span>
                  {c.status !== "not-checked" && c.detail && (
                    <span className="font-mono text-[10px] text-muted-foreground">{c.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {report.status === "fail" && (
            <p className="text-[11px] text-muted-foreground">
              Figures are shown as <span className="text-red">Draft — not reconciled</span>. A failed
              check usually means an unmapped account or a period mismatch, not a typo — the numbers
              come straight from Practical.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact one-line status for the dashboard toolbar. */
export function IntegrityStatusPill({ report }: { report: IntegrityReport }) {
  const tone = TONE[report.status];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px]",
        tone.box,
        tone.text,
      )}
      title={report.checks
        .map((c) => `${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "—"} ${c.label}`)
        .join("\n")}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {integritySummary(report)}
    </span>
  );
}
