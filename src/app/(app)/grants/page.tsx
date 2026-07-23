import { Landmark, Banknote, Send, AlertTriangle, Lock } from "lucide-react";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { allGrantFigures, grantSummary, GRANT_REGISTER } from "@/lib/grants";
import { formatCompact, formatPercent } from "@/lib/format";
import { loadPriorYear, previousFyLabel } from "@/lib/prior-year";
import { YoY } from "@/components/kit/yoy";
import { Content } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { GrantRegisterTable } from "@/components/grants/grant-register-table";
import { GrantMix } from "@/components/dashboard/grant-mix";
import { DataQualityBadge } from "@/components/kit/data-quality-badge";
import { grantIssues } from "@/lib/data-quality";
import { grantRisk } from "@/lib/grant-risk";
import { GrantRiskPanel } from "@/components/grants/grant-risk-panel";
import { grantDeadlines } from "@/lib/grant-deadlines";
import { DeadlinePanel } from "@/components/grants/deadline-panel";
import { NarrativeDrafter } from "@/components/grants/narrative-drafter";
import { aiConfigured } from "@/lib/ai/narrative";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { ReferenceUploadButton } from "@/components/kit/reference-upload";
import { referenceMeta } from "@/lib/reference";

export const dynamic = "force-dynamic";

export default async function GrantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = await resolvePeriodView(await searchParams);
  const snapshot = view.snapshot;
  const regMeta = (await referenceMeta())["grant-register"];
  const figures = allGrantFigures(snapshot);
  const s = grantSummary(figures);
  const risk = grantRisk(figures);
  const deadlines = grantDeadlines(figures);
  const session = await getSession();
  const mayDraft = can(session?.role, "grants.edit");
  const utilisation = s.totalBudgetedExpense > 0 ? s.expenseToDate / s.totalBudgetedExpense : 0;

  // Income received and spend to date are year-to-date FLOWS, so they only compare
  // fairly to the SAME month last year — not to a full prior year. The label is kept
  // even when the archive is empty, so the "vs …—" line shows and fills in later.
  const prior = await loadPriorYear(snapshot);
  const priorS = prior?.sameMonth ? grantSummary(allGrantFigures(prior.snapshot)) : null;
  const priorLabel = prior?.periodLabel ?? previousFyLabel(snapshot.period.fyLabel) ?? "last year";

  return (
    <Content>
      <PageToolbar
        view={view}
        filters={<DataQualityBadge issues={grantIssues(s)} />}
        /*
          The register upload is a BUTTON now, not the full-width panel that used to
          sit between the charts and the table. It is a thing you do roughly once a
          year — when the Council issues a new register — and it was taking prime
          screen space every day in between.
        */
        actions={
          <ReferenceUploadButton
            kind="grant-register"
            label="Update register"
            title="Grant Register"
            description="The Council's register, converted to JSON by scripts/import-grant-register.mjs. It sets each grant's value and the GL/job codes that carry its income and spend. This is the ONE input the platform cannot read from Practical — grant names, funders, restricted flags and job codes exist nowhere in the accounting system. Validated before it replaces anything: ids must be unique, totals numeric, code lists present. A rejected file changes nothing, and the version it replaces is kept."
            currentLabel={
              regMeta
                ? `${regMeta.itemCount} grants · uploaded ${new Date(regMeta.uploadedAt).toLocaleDateString("en-AU")}${regMeta.uploadedBy ? ` by ${regMeta.uploadedBy}` : ""}`
                : `${GRANT_REGISTER.grants.length} grants · ${GRANT_REGISTER.source}`
            }
          />
        }
        notes={
          <>
            <InfoNote label="The register">
              {GRANT_REGISTER.source} · imported {GRANT_REGISTER.importedAt}.
            </InfoNote>
            <InfoNote label="How spend is measured">
              Grant expenditure is the sum of its job codes&apos; costs in the general ledger — not a
              figure anyone types in. Grants with no job code cannot be measured, and are flagged rather
              than shown as $0 spent.
            </InfoNote>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard color="gold" icon={Landmark} label="Grants Tracked" value={s.count} meta="From the grant register" />
        <KpiCard
          color="teal"
          icon={Banknote}
          label="Total Grant Income"
          value={formatCompact(s.totalGrantIncome)}
          meta={
            <span className="flex flex-col gap-0.5">
              <span>{formatCompact(s.incomeToDate)} received to date</span>
              <YoY now={s.incomeToDate} then={priorS?.incomeToDate} good="up" suffix={priorLabel} />
            </span>
          }
        />
        <KpiCard
          color="blue"
          icon={Send}
          label="Income Remaining"
          value={formatCompact(s.incomeRemaining)}
          meta="Still to be received"
        />
        <KpiCard
          color="amber"
          icon={Send}
          label="Spent to Date"
          value={formatCompact(s.expenseToDate)}
          meta={
            <span className="flex flex-col gap-0.5">
              <span>{formatPercent(utilisation)} of budgeted expense</span>
              <YoY now={s.expenseToDate} then={priorS?.expenseToDate} good="neutral" suffix={priorLabel} />
            </span>
          }
        />
        <KpiCard
          color={s.needsAttention > 0 ? "red" : "green"}
          icon={s.needsAttention > 0 ? AlertTriangle : Lock}
          label={s.needsAttention > 0 ? "Codes To Fix" : "Restricted Unspent"}
          value={s.needsAttention > 0 ? s.needsAttention : formatCompact(s.restrictedUnspent)}
          meta={s.needsAttention > 0 ? "Register rows unresolved" : "Unspent restricted grant cash"}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GrantMix summary={s} periodLabel={snapshot.period.label} />
        <GrantRiskPanel risk={risk} />
      </div>

      <div className="mb-6">
        <DeadlinePanel report={deadlines} />
      </div>

      {mayDraft && (
        <div className="mb-6">
          <NarrativeDrafter
            configured={aiConfigured()}
            grants={figures
              .filter((f) => f.entry.active && !f.hasUnresolvedCodes)
              .map((f) => ({ id: f.entry.id, name: f.entry.name }))}
          />
        </div>
      )}

      <GrantRegisterTable figures={figures} />
    </Content>
  );
}
