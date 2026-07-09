import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { listAudit } from "@/lib/auth/db";

export const dynamic = "force-dynamic";

/** Audit trail — visible to admins only (brief B9). */
export default async function AuditPage() {
  const session = await getSession();
  // Hide the route's existence from non-admins.
  if (!isAuthConfigured() || session?.role !== "admin") notFound();

  const rows = await listAudit(200);

  return (
    <Content>
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Audit Log"
          subtitle="Logins, password changes and exports · admin only"
        />
        {rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  {["When", "User", "Action", "Detail"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#dce8f0]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[rgba(255,255,255,0.03)]">
                    <td className="whitespace-nowrap border-b border-[rgba(255,255,255,0.04)] px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-[13px] text-foreground">
                      {r.username ?? "—"}
                    </td>
                    <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                        <ShieldCheck className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
                        {r.action}
                      </span>
                    </td>
                    <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-[12px] text-muted-foreground">
                      {r.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Content>
  );
}
