import { Content } from "@/components/kit/panel";
import { MappingForm, type AccountRow, type GrantRow, type DeptOption } from "@/components/mapping/mapping-form";
import { loadRawSnapshotFromFeed } from "@/lib/data/feed";
import { readOverrides } from "@/lib/feed/overrides";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
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

  // One row per visible GL account, with its original dept + any override.
  const accounts: AccountRow[] = [];
  const seen = new Set<string>();
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

  const grants: GrantRow[] = base.grants.map((g) => ({
    id: g.id,
    originalName: g.name,
    originalDeptId: g.departmentId,
    originalDeptName: deptName[g.departmentId] ?? g.departmentId,
    funder: g.funder,
    total: g.total,
    name: grantOv[g.id]?.name ?? "",
    departmentId: grantOv[g.id]?.departmentId ?? "",
  }));

  const unmapped = base.meta?.unmappedAccounts ?? 0;

  return (
    <Content>
      {unmapped > 0 && (
        <div className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2.5 text-[12px] text-amber">
          <span className="font-semibold">{unmapped}</span> active GL account{unmapped === 1 ? "" : "s"} aren&apos;t
          mapped to a department, so their amounts may be missing from department totals. Check the chart of accounts
          in Practical (brief A7).
        </div>
      )}
      <MappingForm
        departments={departments}
        accounts={accounts}
        grants={grants}
        passwordRequired={!!process.env.UPLOAD_PASSWORD}
      />
    </Content>
  );
}
