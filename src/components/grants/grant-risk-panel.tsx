import Link from "next/link";
import { AlertTriangle, ShieldCheck, HelpCircle, Clock } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCurrency } from "@/lib/format";
import type { RiskSummary, RiskLevel } from "@/lib/grant-risk";
import { cn } from "@/lib/utils";

/**
 * Unacquitted grants and clawback risk (B8).
 *
 * The number that matters is not "how much have we been given" — it's how much we're
 * SITTING ON. Money received and not spent belongs, conditionally, to somebody else.
 */
export function GrantRiskPanel({ risk }: { risk: RiskSummary }) {
  const atRisk = risk.rows.filter((r) => r.level === "high" || r.level === "medium");
  const clean = risk.highCount === 0 && risk.overdueCount === 0;

  return (
    <Panel>
      <PanelHeader
        title="Unacquitted funding"
        subtitle="Received, not yet spent"
        right={
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]",
              clean
                ? "border-green/30 bg-green/10 text-green"
                : "border-red/30 bg-red/10 text-red",
            )}
          >
            {clean ? <ShieldCheck className="h-3 w-3" strokeWidth={2} /> : <AlertTriangle className="h-3 w-3" strokeWidth={2} />}
            {clean ? "Nothing overdue" : `${risk.highCount} need attention`}
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fig
          label="Held, not yet spent"
          value={formatCurrency(risk.totalAtRisk)}
          note="Cash received against grants"
        />
        {/*
          "$0 past its end date" is only good news if we HAVE end dates. Hope Vale's
          register has none, so a green zero here would be a confident falsehood — the
          same failure the deadline panel was rewritten to avoid.
        */}
        <Fig
          label="Past its end date"
          value={risk.datesKnown ? formatCurrency(risk.overdue) : "Unknown"}
          note={
            risk.datesKnown
              ? `${risk.overdueCount} ${risk.overdueCount === 1 ? "grant" : "grants"} — the clawback case`
              : "No end dates in the register"
          }
          tone={!risk.datesKnown ? "warn" : risk.overdue > 0 ? "bad" : undefined}
        />
        <Fig
          label="Cannot be assessed"
          value={String(risk.unknownCount)}
          note="Register codes don't resolve"
          tone={risk.unknownCount > 0 ? "warn" : undefined}
        />
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
        Ranks cash <span className="text-foreground">received and not yet spent</span> — the only part
        a funder can claw back.
        {!risk.datesKnown && (
          <span className="mt-1.5 block text-amber">
            Ranked on spend alone — the register has no end dates. Adding them sharpens this.
          </span>
        )}
      </p>

      {atRisk.length === 0 ? (
        <p className="rounded-md border border-green/25 bg-green/[0.04] px-3 py-2.5 text-[13px] text-green">
          Every grant with funding received is being spent on schedule.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {atRisk.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0">
              <RiskDot level={r.level} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[13px] font-medium text-foreground">{r.name}</span>
                  <span className="font-mono text-[13px] tabular-nums text-foreground">
                    {formatCurrency(r.atRisk)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{r.reason}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  <span>{r.funder}</span>
                  <span>{(r.acquitted * 100).toFixed(0)}% acquitted</span>
                  {r.daysLeft !== null && (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        r.daysLeft < 0 ? "text-red" : r.daysLeft < 180 ? "text-amber" : "",
                      )}
                    >
                      <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                      {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d left`}
                    </span>
                  )}
                  {r.restricted && <span className="text-gold">restricted</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {risk.unknownCount > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber/25 bg-amber/[0.04] px-3 py-2.5">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber" strokeWidth={1.75} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-amber">{risk.unknownCount} grants can&rsquo;t be assessed</span> —
            their register codes don&rsquo;t resolve, so spend is unknown (not zero). Fix them in{" "}
            <Link href="/mapping" className="text-foreground underline decoration-border underline-offset-2">
              Account Mapping
            </Link>
            .
          </p>
        </div>
      )}
    </Panel>
  );
}

function Fig({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-elevated/30 px-3.5 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-heading text-[19px] font-semibold tabular-nums",
          tone === "bad" ? "text-red" : tone === "warn" ? "text-amber" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function RiskDot({ level }: { level: RiskLevel }) {
  return (
    <span
      className={cn(
        "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
        level === "high" ? "bg-red" : level === "medium" ? "bg-amber" : "bg-muted-foreground/40",
      )}
    />
  );
}
