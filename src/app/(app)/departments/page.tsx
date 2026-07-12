import { getSnapshot } from "@/lib/data";
import { deriveDepartments } from "@/lib/derive";
import { Content } from "@/components/kit/panel";
import { ManagerCard } from "@/components/managers/manager-card";
import { CostRecoveryPanel } from "@/components/departments/cost-recovery-panel";
import { costRecovery } from "@/lib/cost-recovery";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const snapshot = await getSnapshot();
  const departments = deriveDepartments(snapshot);
  const recovery = costRecovery(departments);

  return (
    <Content>
      {/* B7 — do the trading operations pay for themselves? Refuses to score
          rather than divide by a negative year-to-date cost. */}
      <div className="mb-4">
        <CostRecoveryPanel recovery={recovery} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {departments.map((d) => (
          <ManagerCard key={d.id} department={d} period={snapshot.period} />
        ))}
      </div>
    </Content>
  );
}
