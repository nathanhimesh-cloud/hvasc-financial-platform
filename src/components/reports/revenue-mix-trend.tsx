"use client";

import { Layers } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Revenue mix over time — grant income vs the Council's own-source revenue, month
 * by month (Build Brief B6).
 *
 * The single most important sustainability question for a remote council is how much
 * of its money it raises itself versus how much arrives as grants that can stop. One
 * number answers it today; this shows whether the balance is moving.
 *
 * Bars are cumulative year-to-date, so each month is the mix "so far". Early in the
 * year there is only a point or two — that's expected; the chart fills in as the
 * year posts, and it says so rather than pretending to be a trend.
 */
const GRANT_RE = /grant|subsid/i;

interface Period {
  month: string;
  totalIncome: number;
  revenueLines: { id: string; label: string; ytd: number }[];
}

export function RevenueMixTrend({ periods }: { periods: Period[] }) {
  const pts = periods.map((p) => {
    const grant = p.revenueLines
      .filter((r) => GRANT_RE.test(r.id) || GRANT_RE.test(r.label))
      .reduce((a, r) => a + r.ytd, 0);
    const own = Math.max(p.totalIncome - grant, 0);
    return { month: p.month, grant: Math.max(grant, 0), own, total: Math.max(grant, 0) + own };
  });

  const peak = Math.max(...pts.map((p) => p.total), 1);
  const last = pts[pts.length - 1];
  const dependency = last && last.total > 0 ? last.grant / last.total : 0;

  return (
    <Panel>
      <PanelHeader
        title="Revenue mix over time"
        subtitle="Grants vs own-source · cumulative"
        right={<Layers className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Grant dependency {last ? `· ${last.month}` : ""}
          </div>
          <div className="font-heading text-[22px] font-semibold tabular-nums text-foreground">
            {formatPercent(dependency)}
            <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">of revenue is grants</span>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.06em]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-gold" /> Grants
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-teal" /> Own-source
          </span>
        </div>
      </div>

      {/* A stacked-column TREND of one month is one bar — pointless and tall. Below
          two months, show a single compact split bar (grants vs own-source) instead;
          the full column chart returns once there's more than a point to plot. */}
      {pts.length > 1 ? (
        <>
      <div className="flex h-[140px] items-end gap-2">
        {pts.map((p) => {
          const gH = Math.round((p.grant / peak) * 132);
          const oH = Math.round((p.own / peak) * 132);
          return (
            <div key={p.month} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex h-[132px] w-full max-w-[46px] flex-col justify-end">
                <div
                  title={`${p.month} · own-source ${formatCompact(p.own)}`}
                  className="w-full rounded-t-sm bg-teal"
                  style={{ height: `${Math.max(oH, p.own > 0 ? 2 : 0)}px` }}
                />
                <div
                  title={`${p.month} · grants ${formatCompact(p.grant)}`}
                  className="w-full bg-gold"
                  style={{ height: `${Math.max(gH, p.grant > 0 ? 2 : 0)}px` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-2">
        {pts.map((p) => (
          <span
            key={p.month}
            className="min-w-0 flex-1 truncate text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
          >
            {p.month}
          </span>
        ))}
      </div>
        </>
      ) : last && last.total > 0 ? (
        <div>
          <div className="flex h-9 w-full overflow-hidden rounded-md bg-[var(--track)]">
            {last.grant > 0 && (
              <div className="h-full bg-gold" style={{ width: `${(last.grant / last.total) * 100}%` }} title={`Grants ${formatCompact(last.grant)}`} />
            )}
            {last.own > 0 && (
              <div className="h-full bg-teal" style={{ width: `${(last.own / last.total) * 100}%` }} title={`Own-source ${formatCompact(last.own)}`} />
            )}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <span>Grants {formatCompact(last.grant)}</span>
            <span>Own-source {formatCompact(last.own)}</span>
          </div>
        </div>
      ) : null}

      {pts.length < 2 && (
        <p className={cn("mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground")}>
          Only {pts.length === 1 ? "one month is" : "no months are"} posted this year — the trend draws
          itself as more months land.
        </p>
      )}
    </Panel>
  );
}
