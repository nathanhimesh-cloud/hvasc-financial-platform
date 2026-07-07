import { AppShell } from "@/components/layout/app-shell";
import type { DeptNavItem } from "@/components/layout/sidebar";
import { getSnapshot } from "@/lib/data";
import { grantKpis } from "@/lib/derive";
import type { PageMetaContext } from "@/lib/nav";

// The dashboard reads the latest uploaded snapshot at request time, so render
// dynamically instead of serving a build-time static copy (otherwise an upload
// wouldn't show until the next deploy).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = await getSnapshot();

  const departments: DeptNavItem[] = snapshot.departments.map((d) => ({
    slug: d.slug,
    name: d.name,
    icon: d.icon,
  }));
  const deptNames = Object.fromEntries(
    snapshot.departments.map((d) => [d.slug, d.name]),
  );
  const grants = grantKpis(snapshot);

  const metaCtx: PageMetaContext = {
    fyLabel: snapshot.period.fyLabel,
    periodLabel: snapshot.period.label,
    monthOfYear: snapshot.period.monthOfYear,
    monthsInYear: snapshot.period.monthsInYear,
    deptCount: snapshot.departments.length,
    grantCount: snapshot.grants.length,
    grantsNeedingAction: grants.needingAction,
    live: snapshot.period.live,
    budgetEstimated: !!snapshot.period.budgetEstimated,
    comparisonLabel: snapshot.period.comparisonLabel ?? "Budget",
    updatedAt: snapshot.meta?.generatedAt,
  };

  return (
    <AppShell
      departments={departments}
      deptNames={deptNames}
      grantsBadge={grants.needingAction}
      lastSync={snapshot.meta?.generatedAt}
      metaCtx={metaCtx}
    >
      {children}
    </AppShell>
  );
}
