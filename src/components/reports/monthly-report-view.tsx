import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { MonthlyReport } from "@/lib/monthly-report";
import { formatCurrency, formatCompact, formatPercent } from "@/lib/format";
import { YoY } from "@/components/kit/yoy";
import { ragText } from "@/lib/rag";
import { cn } from "@/lib/utils";

/**
 * The printable monthly management report. Server component — pure presentation
 * of the report model. Designed to read cleanly on screen and in the print/PDF
 * (the `@media print` rules in globals.css handle the palette + hide chrome).
 */
export function MonthlyReportView({ report }: { report: MonthlyReport }) {
  const monthsElapsed = report.monthOfYear;
  return (
    <article className="mx-auto max-w-4xl">
      {/* Masthead */}
      <header className="mb-8 border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-[26px] font-bold text-foreground">{report.title}</h1>
            <p className="mt-0.5 text-[15px] text-muted-foreground">{report.subtitle}</p>
          </div>
          <div className="text-right font-mono text-[11px] text-muted-foreground">
            <div className="text-[13px] font-semibold text-foreground">Hope Vale Aboriginal Shire Council</div>
            <div>{report.periodLabel} · {report.fyLabel}</div>
            <div>Month {report.monthOfYear} of {report.monthsInYear} · YTD</div>
            {report.generatedAt && <div>Prepared {report.generatedAt}</div>}
          </div>
        </div>
      </header>

      {/* 1. Executive summary */}
      <Section n="1" title="Executive summary">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Total income (YTD)"
            value={formatCompact(report.income)}
            sub={<YoY now={report.income} then={report.prior?.income} good="up" suffix={report.prior?.periodLabel ?? "last year"} />}
          />
          <Stat
            label="Total expenses (YTD)"
            value={formatCompact(report.expenses)}
            sub={<YoY now={report.expenses} then={report.prior?.expenses} good="down" suffix={report.prior?.periodLabel ?? "last year"} />}
          />
          <Stat
            label={report.surplus ? "Net surplus (YTD)" : "Net deficit (YTD)"}
            value={formatCompact(Math.abs(report.netResult))}
            tone={report.surplus ? "pos" : "neg"}
            sub={<YoY now={report.netResult} then={report.prior?.netResult} good="up" suffix={report.prior?.periodLabel ?? "last year"} />}
          />
          <Stat
            label={report.hasBudget ? "Budget used (YTD)" : "vs prior year"}
            value={report.ytdBudget > 0 ? formatPercent(report.utilisation) : "—"}
          />
        </div>
      </Section>

      {/* 2. Budget position */}
      <Section n="2" title={report.scope === "consolidated" ? "Budget position" : "Department budget position"}>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            <Row label="Annual budget" value={formatCurrency(report.annualBudget)} />
            <Row label={`Budget to date (${monthsElapsed}/${report.monthsInYear})`} value={formatCurrency(report.ytdBudget)} muted />
            <Row label="Actual to date" value={formatCurrency(report.ytdActual)} strong />
            <Row
              label="Variance to date"
              value={formatCurrency(report.variance)}
              tone={report.variance >= 0 ? "pos" : "neg"}
              note={report.variance >= 0 ? "under budget" : "over budget"}
            />
          </tbody>
        </table>
      </Section>

      {/* 3. Lines (departments or GL lines) */}
      {report.lines.length > 0 && (
        <Section n="3" title={report.linesLabel}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <Th className="text-left">{report.scope === "consolidated" ? "Department" : "Account"}</Th>
                {report.scope === "consolidated" && <Th>Annual budget</Th>}
                {report.scope === "consolidated" && <Th>Budget to date</Th>}
                <Th>Actual to date</Th>
                {report.scope === "consolidated" && <Th>Variance</Th>}
                {report.scope === "consolidated" && <Th>% used</Th>}
              </tr>
            </thead>
            <tbody>
              {report.lines.map((l) => (
                <tr key={l.label} className="border-b border-[rgba(255,255,255,0.05)]">
                  <td className="py-2 pr-3 text-foreground">{l.label}</td>
                  {report.scope === "consolidated" && <Money v={l.budget} />}
                  {report.scope === "consolidated" && (
                    <Money raw={l.budget > 0 ? formatCurrency(l.budget * (monthsElapsed / report.monthsInYear)) : "—"} muted />
                  )}
                  <Money v={l.actual} strong />
                  {report.scope === "consolidated" && (
                    <td className="py-2 pl-3 text-right font-mono tabular-nums">
                      <span className={l.variance >= 0 ? "text-green" : "text-red"}>{formatCurrency(l.variance)}</span>
                    </td>
                  )}
                  {report.scope === "consolidated" && (
                    <td className="py-2 pl-3 text-right font-mono tabular-nums">
                      {l.utilisation > 0 ? <span className={ragText[l.rag]}>{formatPercent(l.utilisation)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 4. Grants */}
      {report.grants && (
        <Section n="4" title="Grant funding">
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Active grants" value={String(report.grants.count)} />
            <Stat label="Total grant income" value={formatCompact(report.grants.totalGrantIncome)} />
            <Stat label="Received to date" value={formatCompact(report.grants.incomeToDate)} />
            <Stat label="Spent to date" value={formatCompact(report.grants.expenseToDate)} />
          </div>
          {report.grants.disaster.count > 0 && (
            <p className="mb-3 text-[12px] text-muted-foreground">
              Includes <span className="text-foreground">{formatCompact(report.grants.disaster.totalGrantIncome)}</span> of
              disaster-recovery funding (QRA/NDRRA) across {report.grants.disaster.count} grants — one-off and
              reimbursement-based, shown separately from the recurring base.
            </p>
          )}
        </Section>
      )}
      {report.scope !== "consolidated" && report.grantRows.length > 0 && (
        <Section n="4" title="Grants — this department">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <Th className="text-left">Grant</Th>
                <Th>Total</Th>
                <Th>Received</Th>
                <Th>Spent</Th>
              </tr>
            </thead>
            <tbody>
              {report.grantRows.map((g) => (
                <tr key={g.entry.id} className="border-b border-[rgba(255,255,255,0.05)]">
                  <td className="py-2 pr-3 text-foreground">{g.entry.name}</td>
                  <Money v={g.totalGrantIncome} />
                  <Money v={g.incomeToDate} muted />
                  <Money v={g.expenseToDate} />
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 5. Cash & liquidity (consolidated only) */}
      {report.cash && (
        <Section n="5" title="Cash & liquidity">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Total cash" value={formatCompact(report.cash.totalCash)} />
            <Stat
              label="Unrestricted cash"
              value={`${report.cash.exact ? "" : "≤ "}${formatCompact(report.cash.unrestrictedCash)}`}
            />
            <Stat
              label="Months of cover"
              value={report.cash.monthsCover === null ? "—" : `${report.cash.exact ? "" : "≤ "}${report.cash.monthsCover.toFixed(1)}`}
              tone={report.cash.belowMinimum ? "neg" : "pos"}
            />
          </div>
          {!report.cash.exact && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Restricted-cash figures are bounds, not exact — the grant register is missing some opening balances and
              job codes. Unrestricted cash and months of cover are ceilings.
            </p>
          )}
        </Section>
      )}

      {/* 6. Accuracy checks (consolidated only) */}
      {report.integrity && (
        <Section n="6" title="Accuracy checks">
          <ul className="flex flex-col gap-1.5">
            {report.integrity.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[12px]">
                {c.status === "pass" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green" strokeWidth={2} />
                ) : c.status === "fail" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red" strokeWidth={2} />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
                )}
                <span className="text-foreground">{c.label}</span>
                {c.reason && <span className="text-muted-foreground">— {c.reason}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Notes */}
      {report.notes.length > 0 && (
        <Section n={report.integrity ? "7" : "5"} title="Notes">
          <ul className="flex flex-col gap-1.5">
            {report.notes.map((note, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-muted-foreground">• {note}</li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-8 border-t border-border pt-4 font-mono text-[10px] text-muted-foreground">
        Prepared by Vantage · Hope Vale Aboriginal Shire Council · Live from Civica Practical Plus (read-only).
        Figures depend on the accuracy of data recorded in Practical.
      </footer>
    </article>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 break-inside-avoid">
      <h2 className="mb-3 flex items-baseline gap-2 font-heading text-[16px] font-semibold text-foreground">
        <span className="font-mono text-[12px] text-muted-foreground">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "pos" | "neg"; sub?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-elevated/30 px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-heading text-[19px] font-semibold tabular-nums", tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : "text-foreground")}>
        {value}
      </div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong, muted, tone, note }: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: "pos" | "neg"; note?: string }) {
  return (
    <tr className="border-b border-[rgba(255,255,255,0.05)]">
      <td className="py-2 pr-3 text-muted-foreground">{label}</td>
      <td className={cn("py-2 pl-3 text-right font-mono tabular-nums", strong && "font-semibold text-foreground", tone === "pos" && "text-green", tone === "neg" && "text-red", !strong && !tone && (muted ? "text-muted-foreground" : "text-foreground"))}>
        {value}
        {note && <span className="ml-1.5 font-sans text-[11px] text-muted-foreground">{note}</span>}
      </td>
    </tr>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("py-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground", className)}>{children}</th>;
}

function Money({ v, raw, strong, muted }: { v?: number; raw?: string; strong?: boolean; muted?: boolean }) {
  return (
    <td className={cn("py-2 pl-3 text-right font-mono tabular-nums", strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground")}>
      {raw ?? (v === undefined ? "—" : formatCurrency(v))}
    </td>
  );
}
