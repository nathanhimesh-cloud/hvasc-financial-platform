import { ShieldCheck, ShieldAlert, History } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import type { IntegrityHistory } from "@/lib/integrity-log";
import { cn } from "@/lib/utils";

/**
 * Accuracy checks, over time (A4b).
 *
 * A4 answers "is today's report trustworthy?". This answers the auditor's question —
 * "has it ever not been?" — which nobody could answer while each sync overwrote the
 * last.
 *
 * The strip below is one mark per sync, oldest on the left. A red mark stays red
 * forever. It is not tidied up once the underlying problem is fixed, because a month
 * where the balance sheet didn't balance IS a fact about that month, and hiding it
 * once it's resolved is how a record stops being a record.
 */
export function IntegrityHistoryPanel({ history }: { history: IntegrityHistory }) {
  if (history.runs.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Accuracy checks over time" subtitle="One result per sync" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          No history yet. Every sync from now on records whether the figures passed their
          checks — and that record is append-only, so a failure can never be quietly
          removed later.
        </p>
      </Panel>
    );
  }

  const clean = history.failedRuns === 0;
  // Oldest → newest reads like a timeline. The list arrives newest-first.
  const strip = [...history.runs].reverse();

  return (
    <Panel>
      <PanelHeader
        title="Accuracy checks over time"
        subtitle={`Last ${history.runs.length} syncs`}
        right={
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]",
              clean ? "border-green/30 bg-green/10 text-green" : "border-amber/30 bg-amber/10 text-amber",
            )}
          >
            {clean ? <ShieldCheck className="h-3 w-3" strokeWidth={2} /> : <ShieldAlert className="h-3 w-3" strokeWidth={2} />}
            {clean ? "Never failed" : `${history.failedRuns} failed`}
          </span>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Clean streak
          </div>
          <div className="font-heading text-[22px] font-semibold tabular-nums text-foreground">
            {history.cleanStreak}
            <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
              {history.cleanStreak === 1 ? "sync" : "syncs"} in a row
            </span>
          </div>
        </div>
      </div>

      {/* One mark per sync. Fixed height, so a percentage can't collapse to 0px. */}
      <div className="flex h-8 items-end gap-[3px] overflow-x-auto">
        {strip.map((r) => (
          <span
            key={r.id}
            title={`${new Date(r.checkedAt).toLocaleString("en-AU")} · ${r.periodLabel} · ${
              r.passed ? "passed" : `${r.checksFailed} of ${r.checksTotal} checks failed`
            }`}
            className={cn(
              "h-full w-[7px] flex-shrink-0 rounded-sm",
              r.passed ? "bg-green/60" : "bg-red",
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        <span>oldest</span>
        <span>latest</span>
      </div>

      {history.lastFailure && (
        <div className="mt-4 rounded-md border border-red/25 bg-red/[0.04] px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <History className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-foreground">
                Most recent failure —{" "}
                {new Date(history.lastFailure.checkedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                ({history.lastFailure.periodLabel})
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {history.lastFailure.failures.map((f) => (
                  <li key={f.id} className="text-[12px] leading-relaxed text-muted-foreground">
                    <span className="text-red">{f.label}</span>
                    {f.detail ? ` — ${f.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
