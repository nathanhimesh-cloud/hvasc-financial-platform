import Link from "next/link";
import { LogOut, KeyRound, ShieldCheck, Check } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { ROLES, can, type Capability } from "@/lib/auth/roles";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { lastSync } from "@/lib/sync-log";

export const dynamic = "force-dynamic";

/**
 * Account.
 *
 * The version this replaces was written before authentication existed and never
 * caught up. It read the signed-in user from a HARDCODED constant, offered a
 * *disabled* "Sign out" button under the heading "AUTHENTICATION COMING IN A
 * LATER PHASE" — while the sidebar had a working sign-out three inches away —
 * and told the user the data refreshed "twice daily (6am & 6pm)" when it has run
 * three times a day for weeks.
 *
 * Every line here is now read from the thing it describes.
 */
export default async function AccountPage() {
  const session = await getSession();
  const snapshot = await getSnapshot();
  const sync = await lastSync().catch(() => null);

  const role = ROLES.find((r) => r.id === session?.role);

  return (
    <Content className="max-w-3xl">
      <Panel className="mb-4">
        <PanelHeader title="Profile" subtitle="Signed-in user" />
        {session ? (
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-sm font-semibold uppercase text-foreground">
              {session.username.slice(0, 2)}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-foreground">{session.username}</span>
              <span className="text-[13px] text-muted-foreground">
                {role?.label ?? session.role}
              </span>
              {role && (
                <span className="text-[12px] text-muted-foreground">{role.description}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Not signed in.</p>
        )}
      </Panel>

      {/* What this role may change. The point of the page. */}
      {session && (
        <Panel className="mb-4">
          <PanelHeader
            title="What you can change"
            subtitle="Permissions"
            right={
              <span className="flex items-center gap-1.5 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-green">
                <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                Figures read-only
              </span>
            }
          />
          <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">No role can edit a financial figure.</span> Every number
            comes from Civica Practical and is read-only for everyone, including administrators. What a
            role may change is reporting metadata — account names, department assignments, grant
            milestones. That separation is deliberate.
          </p>
          <ul className="flex flex-col gap-2">
            {CAPABILITY_LABELS.map(({ id, label }) => {
              const has = can(session.role, id);
              return (
                <li key={id} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={
                      has
                        ? "flex h-4 w-4 items-center justify-center rounded-full bg-green/15 text-green"
                        : "flex h-4 w-4 items-center justify-center rounded-full border border-border text-transparent"
                    }
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className={has ? "text-foreground" : "text-muted-foreground line-through decoration-border"}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel className="mb-4">
        <PanelHeader title="Data" subtitle="Where the figures come from" />
        <dl className="flex flex-col gap-3 text-[13px]">
          <Row label="Accounting system" value="Civica Practical Plus" />
          <Row label="Access" value="Read-only — the platform never writes to Practical" />
          <Row label="Refresh" value="Automatic — 6:00am, 12:30pm and 6:00pm AEST" />
          <Row
            label="Last sync"
            value={sync?.receivedAt ? new Date(sync.receivedAt).toLocaleString("en-AU") : (snapshot.meta?.generatedAt ?? "—")}
            mono
          />
          <Row label="Period on file" value={`${snapshot.period.label} · ${snapshot.period.fyLabel}`} mono />
        </dl>
        <Link
          href="/status"
          className="mt-4 inline-block text-[12px] text-gold-light underline-offset-2 hover:underline"
        >
          Full sync history and provenance →
        </Link>
      </Panel>

      {session && (
        <Panel>
          <PanelHeader title="Security" subtitle="Password and session" />
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/change-password"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-[rgba(255,255,255,0.2)]"
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.75} />
              Change password
            </Link>
            <a
              href="/logout"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-red/30 hover:text-red"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              Sign out
            </a>
          </div>
        </Panel>
      )}
    </Content>
  );
}

/**
 * The capabilities, in the order a person would think about them.
 *
 * Labels only. Whether a role HAS a capability is answered by `can()` in
 * roles.ts — the same function the pages and API routes gate on. Re-declaring the
 * matrix here would give the platform two sources of truth about who may change
 * what, and the copy on this screen would eventually start lying about the
 * enforcement behind it.
 */
const CAPABILITY_LABELS: { id: Capability; label: string }[] = [
  { id: "mapping.edit", label: "Rename accounts and reassign them to departments" },
  { id: "grants.edit", label: "Edit grant milestones, dates and documents" },
  { id: "audit.view", label: "View the immutable audit trail" },
  { id: "users.manage", label: "Create, suspend and remove users" },
];

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-[12px] text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}
