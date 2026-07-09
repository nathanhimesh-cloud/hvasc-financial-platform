"use client";

import { Building2, LifeBuoy, Repeat } from "lucide-react";
import { hex } from "@/lib/colors";
import { formatCompact, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import type { GrantSlice, GrantSummary } from "@/lib/grants";

/**
 * Grant mix — the two splits the CFO asked for:
 *
 *   C2  operating vs capital. Operating grants fund recurrent services and stop
 *       when the grant stops; capital grants build an asset the Council then has
 *       to maintain out of its own revenue. Treating them as one number hides both.
 *   C6  disaster recovery (QRA / NDRRA / DRFA / LGGR) carved out from the
 *       business-as-usual grant base — it's lumpy, reimbursement-based, and it
 *       will not recur, so it should never be read as underlying grant income.
 */
export function GrantMix({ summary, periodLabel }: { summary: GrantSummary; periodLabel: string }) {
  const { operating, capital, disaster, business } = summary;

  return (
    <Panel className="h-full">
      <PanelHeader title="Grant Mix" right={<CardBadge>{summary.count} active</CardBadge>} />

      <div className="flex flex-col gap-6">
        <Split
          caption="What the money funds"
          hint="Capital grants build assets the Council must then maintain."
          a={{ ...operating, label: "Operating", color: hex.teal, icon: Repeat, hint: "recurrent services" }}
          b={{ ...capital, label: "Capital", color: hex.blue, icon: Building2, hint: "assets" }}
        />

        <div className="h-px bg-border" />

        <Split
          caption="Where the money comes from"
          hint="Disaster funding is one-off and reimbursement-based — not underlying income."
          a={{ ...business, label: "Business as usual", color: hex.gold, icon: Repeat, hint: "recurring base" }}
          b={{ ...disaster, label: "Disaster recovery", color: hex.amber, icon: LifeBuoy, hint: "QRA / NDRRA / DRFA" }}
        />

        <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">
          Active grants only · {periodLabel} · closed and &quot;remove from FY27&quot; rows excluded
        </p>
      </div>
    </Panel>
  );
}

interface Side extends GrantSlice {
  label: string;
  color: string;
  icon: typeof Repeat;
  hint: string;
}

function Split({ caption, hint, a, b }: { caption: string; hint: string; a: Side; b: Side }) {
  const total = a.totalGrantIncome + b.totalGrantIncome;
  const aShare = total > 0 ? a.totalGrantIncome / total : 0;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="text-[13px] font-semibold text-foreground">{caption}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</div>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-elevated">
        <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${aShare * 100}%`, background: a.color }} />
        <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${(1 - aShare) * 100}%`, background: b.color }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SideCard side={a} share={aShare} />
        <SideCard side={b} share={1 - aShare} />
      </div>
    </section>
  );
}

function SideCard({ side, share }: { side: Side; share: number }) {
  const Icon = side.icon;
  return (
    <div className="rounded-md border border-border bg-elevated/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} style={{ color: side.color }} />
        <span className="truncate text-[12px] font-medium text-foreground">{side.label}</span>
        <span className="ml-auto flex-shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatPercent(share)}
        </span>
      </div>
      <div className="mt-1.5 font-heading text-[19px] font-semibold tabular-nums text-foreground">
        {formatCompact(side.totalGrantIncome)}
      </div>
      <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
        {side.count} grant{side.count === 1 ? "" : "s"} · {formatCompact(side.unspent)} unspent
      </div>
    </div>
  );
}
