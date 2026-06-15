import { Landmark, Banknote, Send, AlertTriangle } from "lucide-react";
import type { BrandColor } from "@/lib/types";
import { getSnapshot } from "@/lib/data";
import { grantKpis } from "@/lib/derive";
import { formatCompact, formatPercent } from "@/lib/format";
import { Content } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { Delta } from "@/components/kit/pills";
import { GrantsTable } from "@/components/grants/grants-table";

export default async function GrantsPage() {
  const snapshot = await getSnapshot();
  const kpis = grantKpis(snapshot);

  const deptIcon: Record<string, string> = {};
  const deptColor: Record<string, BrandColor> = {};
  for (const d of snapshot.departments) {
    deptIcon[d.id] = d.icon;
    deptColor[d.id] = d.color;
  }

  return (
    <Content>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          color="gold"
          icon={Landmark}
          label="Active Grants"
          value={kpis.activeGrants}
          meta="Across all departments"
        />
        <KpiCard
          color="teal"
          icon={Banknote}
          label="Total Grant Funds"
          value={formatCompact(kpis.totalFunds)}
          meta="Current FY allocations"
        />
        <KpiCard
          color="amber"
          icon={Send}
          label="Spent to Date"
          value={formatCompact(kpis.spent)}
          meta={
            <>
              <Delta tone="neutral">{formatPercent(kpis.utilisation)}</Delta>
              <span>utilised</span>
            </>
          }
        />
        <KpiCard
          color={kpis.needingAction > 0 ? "red" : "green"}
          icon={AlertTriangle}
          label="Action Required"
          value={kpis.needingAction}
          meta="Reports or acquittals due"
        />
      </div>

      <GrantsTable grants={snapshot.grants} deptIcon={deptIcon} deptColor={deptColor} />
    </Content>
  );
}
