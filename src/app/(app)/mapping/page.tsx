import { notFound } from "next/navigation";
import { Content } from "@/components/kit/panel";
import { MappingForm, type AccountRow, type GrantRow, type DeptOption } from "@/components/mapping/mapping-form";
import { loadRawSnapshotFromFeed } from "@/lib/data/feed";
import { readOverrides } from "@/lib/feed/overrides";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { GRANT_REGISTER } from "@/lib/grants";
import { resolveDepartment } from "@/lib/departments";
import { DataQualityBadge } from "@/components/kit/data-quality-badge";
import type { DataIssue } from "@/lib/data-quality";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  // Editing account mappings is admin/finance only. Read-only roles (CEO,
  // department heads) never see this page. Note this only ever changes reporting
  // metadata — the GL figures themselves stay read-only for every role.
  if (isAuthConfigured()) {
    const session = await getSession();
    if (!can(session?.role, "mapping.edit")) notFound();
  }

  // Work from the pre-override snapshot so we can show the original imported
  // values, then overlay any saved overrides as the current edits.
  const base = await loadRawSnapshotFromFeed();
  const overrides = await readOverrides();
  const accOv = overrides.accounts ?? {};
  const grantOv = overrides.grants ?? {};

  const departments: DeptOption[] = base.departments.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    icon: d.icon,
  }));
  const deptName = Object.fromEntries(base.departments.map((d) => [d.id, d.name]));

  // Every GL income/expense account, from the full chart the feed now ships.
  // Falls back to the departments' top GL lines on older snapshots, which is why
  // this page used to show a single row: in month 1 almost nothing has a balance.
  const accounts: AccountRow[] = [];
  const seen = new Set<string>();

  if (base.accounts?.length) {
    for (const a of base.accounts) {
      if (seen.has(a.code)) continue;
      seen.add(a.code);
      accounts.push({
        code: a.code,
        originalName: a.name,
        originalDeptId: a.departmentId ?? "",
        originalDeptName: a.departmentId ? (deptName[a.departmentId] ?? a.departmentId) : "Unmapped",
        amount: a.balance,
        name: accOv[a.code]?.name ?? "",
        departmentId: accOv[a.code]?.departmentId ?? "",
      });
    }
  } else {
    for (const d of base.departments) {
      for (const gl of d.glLines) {
        if (seen.has(gl.code)) continue;
        seen.add(gl.code);
        accounts.push({
          code: gl.code,
          originalName: gl.account,
          originalDeptId: d.id,
          originalDeptName: d.name,
          amount: gl.amount,
          name: accOv[gl.code]?.name ?? "",
          departmentId: accOv[gl.code]?.departmentId ?? "",
        });
      }
    }
  }
  // Unmapped first (they're the ones needing a decision), then biggest balance.
  accounts.sort(
    (a, b) =>
      Number(!!a.originalDeptId) - Number(!!b.originalDeptId) ||
      Math.abs(b.amount) - Math.abs(a.amount) ||
      a.code.localeCompare(b.code),
  );

  // Grants come from the Council's Grant Register (89 rows), NOT from the GL
  // revenue accounts that happen to carry a balance — that was one row in July.
  const grants: GrantRow[] = GRANT_REGISTER.grants.map((g) => {
    const code = g.revenueCodes.find((c) => c.type === "single") as { code: string } | undefined;
    const deptId = code ? (resolveDepartment(code.code) ?? "") : "";
    return {
      id: g.id,
      originalName: g.name,
      originalDeptId: deptId,
      originalDeptName: deptId ? (deptName[deptId] ?? deptId) : "Unmapped",
      funder: g.funder || "—",
      total: g.totalFunded,
      name: grantOv[g.id]?.name ?? "",
      departmentId: grantOv[g.id]?.departmentId ?? "",
    };
  });

  const unmappedRows = accounts.filter((a) => !a.originalDeptId).length;
  const issues: DataIssue[] = [];
  if (unmappedRows > 0) {
    issues.push({
      id: "unmapped-accounts",
      level: "warn",
      title: `${unmappedRows} account${unmappedRows === 1 ? "" : "s"} not assigned to a department`,
      detail:
        "Their amounts are missing from department totals. They're listed first below — assign each one, or confirm with Finance that it should be excluded (brief A7).",
    });
  }
  if (!base.accounts?.length) {
    issues.push({
      id: "partial-chart",
      level: "info",
      title: "Showing only accounts with a balance",
      detail:
        "This snapshot predates the full chart of accounts. The next sync from Practical will list every income and expense account here, whether or not money has moved.",
    });
  }

  return (
    <Content>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <DataQualityBadge issues={issues} />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {accounts.length} accounts · {grants.length} grants
        </span>
      </div>
      <MappingForm
        departments={departments}
        accounts={accounts}
        grants={grants}
        passwordRequired={!!process.env.UPLOAD_PASSWORD}
      />
    </Content>
  );
}
