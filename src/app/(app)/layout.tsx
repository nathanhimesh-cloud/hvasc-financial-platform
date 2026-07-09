import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import type { DeptNavItem } from "@/components/layout/sidebar";
import { getSnapshot } from "@/lib/data";
import { grantKpis } from "@/lib/derive";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
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
  // Gate the whole app behind login — but only once auth is configured
  // (AUTH_SECRET + DATABASE_URL set), so nothing breaks before setup.
  const authed = isAuthConfigured();
  const session = authed ? await getSession() : null;
  if (authed && !session) redirect("/login");
  // Still on the default password -> must set their own before using the app.
  if (session?.mustChangePassword) redirect("/change-password");

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
      user={session ? { username: session.username, role: session.role } : null}
      metaCtx={metaCtx}
    >
      {children}
    </AppShell>
  );
}
