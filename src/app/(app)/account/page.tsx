import Link from "next/link";
import { LogOut, KeyRound, ShieldCheck, Check, Activity, Tags, ChevronRight, RefreshCw, FileSpreadsheet, Users, Plug, type LucideIcon } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { getSession } from "@/lib/auth/session";
import { ROLES, can, type Capability } from "@/lib/auth/roles";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { lastSync } from "@/lib/sync-log";
import { getMfa } from "@/lib/auth/db";
import { MfaSetup } from "@/components/users/mfa-setup";

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
  const mfa = session ? await getMfa(session.id).catch(() => null) : null;
  const mfaEnabled = !!mfa?.enabled;

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
      </Panel>

      {/*
        WHAT NEEDS A HUMAN, AND WHAT DOESN'T.
        This is the question nobody could answer from anywhere in the product:
        "which of these numbers keeps itself up to date, and which one is going to
        go stale when someone forgets?" There is exactly one manual input, and it
        deserves to be named rather than left for someone to discover in a year.
      */}
      <Panel className="mb-4">
        <PanelHeader title="Data sources" subtitle="What updates itself, and what doesn't" />

        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-green/25 bg-green/[0.03] px-3 py-2.5">
          <RefreshCw className="mt-0.5 h-4 w-4 flex-shrink-0 text-green" strokeWidth={1.75} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Everything below is automatic</span> — read from the
            general ledger three times a day. It needs no attention, and it rolls into a new financial
            year on its own: the platform reads the current period from Practical, so when the Council
            closes the year, the reports follow.
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-1.5">
          {[
            "Profit & loss, balance sheet, cash flow",
            "Budgets (phased, as Practical holds them)",
            "Transactions and daily spend",
            "Job budgets and job costs",
            "Commitments, from the purchase-order ledger",
            "Debtor and creditor ageing",
            "Assets, capital works, and the statutory ratios",
          ].map((t) => (
            <div key={t} className="flex items-center gap-2 text-[12px]">
              <Check className="h-3 w-3 flex-shrink-0 text-green" strokeWidth={3} />
              <span className="text-muted-foreground">{t}</span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-amber/25 bg-amber/[0.04] px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-foreground">
                One thing needs a person: the Grant Register
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Grant names, funders, restricted flags and job codes exist{" "}
                <span className="text-foreground">nowhere in Practical</span> — the Council keeps them
                in a spreadsheet. Everything the platform reports about grants hangs off that file, so
                when a new financial year brings a new register,{" "}
                <span className="text-foreground">it has to be uploaded</span>. That is the one piece
                of housekeeping this platform cannot do for itself.
              </p>
              <Link
                href="/grants"
                className="mt-2 inline-block text-[12px] text-gold-light underline-offset-2 hover:underline"
              >
                Update it on the Grant Tracker →
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Prior years.</span> Practical keeps{" "}
          <span className="text-foreground">transaction detail for the current year only</span>. A past
          year can be rebuilt as monthly totals — P&amp;L, balance sheet, departments, grants — but its
          individual transactions and daily spend are not in the database and nothing can recover them.
          Ask SandS to run the backfill.
        </p>
      </Panel>

      {/*
        The three admin tools. They used to sit permanently in the sidebar, under
        "Data" — three links most people open once a month, competing for attention
        with the pages they use every morning. They belong here, with the other
        settings, and they're role-gated so nobody sees a link they can't follow.
      */}
      <Panel className="mb-4">
        <PanelHeader title="Data tools" subtitle="Provenance and administration" />
        <div className="flex flex-col divide-y divide-border">
          <ToolLink
            href="/status"
            icon={Activity}
            title="Data Status"
            description="Every sync, when it ran, what it carried, and whether the ledger accepted it."
          />
          {can(session?.role, "mapping.edit") && (
            <ToolLink
              href="/mapping"
              icon={Tags}
              title="Account Mapping"
              description="Which GL account belongs to which department. Changes what reports group by — never a figure."
            />
          )}
          {can(session?.role, "audit.view") && (
            <ToolLink
              href="/audit"
              icon={ShieldCheck}
              title="Audit Log"
              description="Immutable record of every change: who, what, old value, new value, when."
            />
          )}
          {can(session?.role, "users.manage") && (
            <ToolLink
              href="/integrations"
              icon={Plug}
              title="Integrations"
              description="What the platform is connected to, and whether each key is set. Keys live in the deployment environment — never in the database."
            />
          )}
          {can(session?.role, "users.manage") && (
            <ToolLink
              href="/users"
              icon={Users}
              title="Users"
              description="Add people, set roles, and suspend anyone instantly. Users are never deleted — the audit trail must outlive them."
            />
          )}
        </div>
      </Panel>

      {session && (
        <Panel>
          <PanelHeader title="Security" subtitle="Password, two-factor, session" />

          {/*
            MFA is enrolled BY the user, never FOR them. An administrator cannot turn
            it on for someone else — the secret has to reach that person's phone and
            nowhere else. A secret an admin has seen is a second factor the admin also
            holds, which is not a second factor at all.
          */}
          <div className="mb-4 rounded-md border border-border bg-elevated/30 px-3.5 py-3">
            <MfaSetup enabled={mfaEnabled} />
          </div>

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

function ToolLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0"
    >
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground transition-colors group-hover:border-[rgba(255,255,255,0.2)] group-hover:text-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          {title}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}
