import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCompact } from "@/lib/format";
import type { DeadlineReport } from "@/lib/grant-deadlines";
import { cn } from "@/lib/utils";

/**
 * Grant deadlines (B5).
 *
 * The brief asks for email alerts. This is the rule that decides WHAT is worth
 * alerting on — and it ships first, because a mail service wired to a bad rule just
 * delivers the wrong alert faster. When the Council has a mail provider, a scheduled
 * job calls `grantDeadlines()` and sends exactly this list.
 */
export function DeadlinePanel({ report }: { report: DeadlineReport }) {
  const { deadlines, noDates, undatedCount } = report;
  const overdue = deadlines.filter((d) => d.urgency === "overdue").length;

  return (
    <Panel>
      <PanelHeader
        title="Deadlines"
        subtitle="Reports and acquittals falling due"
        right={
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]",
              noDates
                ? "border-amber/30 bg-amber/10 text-amber"
                : overdue > 0
                  ? "border-red/30 bg-red/10 text-red"
                  : deadlines.length > 0
                    ? "border-amber/30 bg-amber/10 text-amber"
                    : "border-green/30 bg-green/10 text-green",
            )}
          >
            <CalendarClock className="h-3 w-3" strokeWidth={2} />
            {noDates
              ? "No dates on file"
              : overdue > 0
                ? `${overdue} overdue`
                : deadlines.length > 0
                  ? `${deadlines.length} within 90 days`
                  : "Nothing due"}
          </span>
        }
      />

      {/*
        "NOTHING DUE" AND "WE DON'T KNOW" ARE NOT THE SAME ANSWER.

        Hope Vale's register carries no dates: endDate is empty on all 89 rows,
        startDate on all 89, reportDue on 88 of 89. An empty list therefore means we
        CANNOT TELL — and rendering that as a green "nothing due in the next 90 days"
        would be a confident falsehood of exactly the kind this platform exists to
        prevent. It would tell a CEO that someone is watching the deadlines when
        nobody is.
      */}
      {noDates ? (
        <div className="flex items-start gap-2.5 rounded-md border border-amber/30 bg-amber/[0.05] px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-amber">No dates in the register yet</span> — so this shows{" "}
            <span className="text-foreground">&ldquo;we can&rsquo;t tell&rdquo;</span>, not
            &ldquo;nothing due&rdquo;. Tracking starts the day the Council adds report and acquittal
            dates ({undatedCount} active grants).
          </p>
        </div>
      ) : deadlines.length === 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-green/25 bg-green/[0.04] px-3 py-2.5 text-[13px] text-green">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
          <span>No grant report or acquittal falls due in the next 90 days.</span>
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {deadlines.slice(0, 10).map((d) => (
            <li key={d.id} className="flex items-start gap-3 py-2.5 first:pt-0">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
                  d.urgency === "overdue"
                    ? "bg-red"
                    : d.urgency === "urgent"
                      ? "bg-amber"
                      : "bg-muted-foreground/40",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[13px] font-medium text-foreground">{d.name}</span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      d.urgency === "overdue" ? "text-red" : "text-muted-foreground",
                    )}
                  >
                    {d.daysLeft < 0 ? `${Math.abs(d.daysLeft)}d overdue` : `${d.daysLeft}d`}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{d.note}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  <span>{d.kind === "report" ? "Progress report" : "Final acquittal"}</span>
                  <span>{d.funder}</span>
                  {d.unspent >= 1000 && (
                    <span className="text-amber">{formatCompact(d.unspent)} unspent</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        Email alerts need a mail provider · not set up yet
      </p>
    </Panel>
  );
}
