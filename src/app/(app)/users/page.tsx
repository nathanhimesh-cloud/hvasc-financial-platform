import { redirect } from "next/navigation";
import { ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { getSession } from "@/lib/auth/session";
import { can, ROLES } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/db";
import { UsersTable } from "@/components/users/users-table";
import { AddUserForm } from "@/components/users/add-user-form";

export const dynamic = "force-dynamic";

/**
 * User administration (Build Brief B9).
 *
 * The brief: "Separate logins for the CEO, finance, department managers and grant
 * managers, each password-protected with MFA. **Admins can remove anyone
 * instantly.**"
 *
 * Until now, removing a user meant a `DELETE` in the database — which is both slow
 * (find someone who can) and wrong (it takes their audit trail with them). Suspend
 * is instant, reversible, and leaves the record intact.
 */
export default async function UsersPage() {
  const session = await getSession();

  // Gated server-side. The nav link is hidden for other roles, but hiding a link is
  // a courtesy, not a control — the route itself has to refuse.
  if (!session || !can(session.role, "users.manage")) redirect("/");

  const users = await listUsers();
  const active = users.filter((u) => !u.suspendedAt);
  const withMfa = active.filter((u) => u.mfaEnabled);

  return (
    <Content className="max-w-5xl">
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Active users" value={String(active.length)} />
        <Stat
          label="With MFA"
          value={`${withMfa.length} of ${active.length}`}
          tone={withMfa.length === active.length ? "good" : "warn"}
        />
        <Stat
          label="Suspended"
          value={String(users.length - active.length)}
          tone={users.length - active.length > 0 ? "warn" : undefined}
        />
      </div>

      {/* MFA is a requirement, not a suggestion. Say so while anyone is without it. */}
      {withMfa.length < active.length && (
        <Panel className="mb-5 flex gap-2.5 border-amber/30 bg-amber/5">
          <ShieldOff className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
          <div className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-amber">
              {active.length - withMfa.length} active {active.length - withMfa.length === 1 ? "user has" : "users have"} no second factor.
            </span>{" "}
            The build brief requires MFA on every login. Each person turns it on themselves from{" "}
            <span className="text-foreground">Settings → Security</span> — an administrator cannot do
            it for them, because the secret has to reach their phone and nowhere else.
          </div>
        </Panel>
      )}

      <Panel className="mb-5">
        <PanelHeader
          title="Add a user"
          subtitle="They set their own password at first login"
          right={<UserPlus className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
        />
        <AddUserForm roles={ROLES} />
      </Panel>

      <Panel>
        <PanelHeader
          title="Users"
          subtitle={`${users.length} total`}
          right={
            <span className="flex items-center gap-1.5 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-green">
              <ShieldCheck className="h-3 w-3" strokeWidth={2} />
              Suspend, never delete
            </span>
          }
        />
        <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
          Suspending takes effect <span className="text-foreground">immediately</span> — it is checked
          on every login attempt, so there is no session to wait out. Users are never deleted:{" "}
          <span className="text-foreground">the audit trail has to outlive the person it describes</span>,
          and that is what makes this platform safe to hand a CEO.
        </p>
        <UsersTable users={users} currentUserId={session.id} roles={ROLES} />
      </Panel>
    </Content>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 font-heading text-[20px] font-semibold tabular-nums " +
          (tone === "good" ? "text-green" : tone === "warn" ? "text-amber" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}
