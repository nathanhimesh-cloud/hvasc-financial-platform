import { getSnapshot } from "@/lib/data";
import { deriveDepartments } from "@/lib/derive";
import { Content } from "@/components/kit/panel";
import { ManagerCard } from "@/components/managers/manager-card";
import { CostRecoveryPanel } from "@/components/departments/cost-recovery-panel";
import { costRecovery } from "@/lib/cost-recovery";
import { loadPriorYear, previousFyLabel } from "@/lib/prior-year";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const snapshot = await getSnapshot();
  const departments = deriveDepartments(snapshot);
  const recovery = costRecovery(departments);

  // Same-month last year for a fair year-to-date spend delta (when archived). The
  // label is passed even when the archive has nothing yet, so each card shows a
  // "vs …—" placeholder that fills in automatically once last year is stored.
  const prior = await loadPriorYear(snapshot);
  const priorLabel = prior?.periodLabel ?? previousFyLabel(snapshot.period.fyLabel) ?? "last year";
  const priorYtdBySlug = new Map<string, number>();
  if (prior?.sameMonth) {
    for (const p of prior.snapshot.departments) priorYtdBySlug.set(p.slug, p.ytdActual);
  }

  return (
    <Content>
      {/* B7 — do the trading operations pay for themselves? Refuses to score
          rather than divide by a negative year-to-date cost. */}
      <div className="mb-4">
        <CostRecoveryPanel recovery={recovery} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {departments.map((d) => (
          <ManagerCard
            key={d.id}
            department={d}
            period={snapshot.period}
            priorYtd={priorYtdBySlug.get(d.slug)}
            priorLabel={priorLabel}
          />
        ))}
      </div>
    </Content>
  );
}
