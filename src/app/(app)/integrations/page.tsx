import { redirect } from "next/navigation";
import { CheckCircle2, XCircle, KeyRound, ShieldAlert } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Integrations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO BOX TO PASTE A KEY INTO
 *
 * The obvious design — a form, a text field, "Save" — is the wrong one, and it is
 * wrong in a way that is invisible until it hurts.
 *
 * A key typed into a web form has to be STORED. That means it lands in Postgres,
 * and therefore in every database backup, and therefore in every copy of a backup
 * anyone has ever taken. It becomes readable by every administrator, and by anything
 * that can read the database — including a SQL injection that would otherwise have
 * been a nuisance rather than a breach. Rotating it means finding every copy.
 *
 * An environment variable does none of that. It is held by the platform (Vercel),
 * never written to our data, never in a backup, and invisible to every user of this
 * application — including the person reading this page.
 *
 * So this page reports STATUS and nothing else. It can tell you a key is present.
 * It cannot show it to you, and neither can anyone else.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session || !can(session.role, "users.manage")) redirect("/");

  // Presence only. The values themselves are never read into a response.
  const integrations = [
    {
      name: "Civica Practical Plus",
      what: "The general ledger. Every figure in the platform comes from here.",
      configured: true,
      how: "Read over ODBC from the Council's own server (HVASC-APP02), three times a day. Read-only — the platform never writes to Practical.",
      env: null,
    },
    {
      name: "Neon Postgres",
      what: "Stores the snapshot, the transaction ledger, users and the audit log.",
      configured: !!process.env.DATABASE_URL,
      how: "Hosted in Sydney (ap-southeast-2). Holds no data that isn't already in Practical, plus this platform's own users and audit trail.",
      env: "DATABASE_URL",
    },
    {
      name: "Claude (Anthropic)",
      what: "Drafts grant acquittal narratives. Optional — everything else works without it.",
      configured: !!process.env.ANTHROPIC_API_KEY?.trim(),
      how: "Sends a grant's already-calculated figures and receives a draft paragraph. It is never permitted to compute a number, and no transaction-level data is sent.",
      env: "ANTHROPIC_API_KEY",
    },
    {
      name: "Vercel Blob",
      what: "Stores uploaded reference files — the grant register, the budget.",
      configured: !!process.env.BLOB_READ_WRITE_TOKEN,
      how: "A private store. Files are not publicly addressable.",
      env: "BLOB_READ_WRITE_TOKEN",
    },
    {
      name: "Microsoft single sign-on",
      what: "Lets staff sign in with their existing Council Microsoft account instead of a Vantage password.",
      // Requires all three; the app treats SSO as off unless the trio is present.
      configured:
        !!process.env.AZURE_AD_TENANT_ID?.trim() &&
        !!process.env.AZURE_AD_CLIENT_ID?.trim() &&
        !!process.env.AZURE_AD_CLIENT_SECRET?.trim(),
      how: "OpenID Connect against the Council's Microsoft tenant. A person is matched to a Vantage user by their email; password login keeps working alongside it. Register the app in Azure → App registrations, redirect URI /api/auth/sso/callback.",
      env: "AZURE_AD_TENANT_ID · AZURE_AD_CLIENT_ID · AZURE_AD_CLIENT_SECRET",
    },
  ];

  return (
    <Content className="max-w-3xl">
      <Panel className="mb-4 border-gold/25 bg-gold/[0.03]">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold" strokeWidth={1.75} />
          <div className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">
              There is no box here to paste a key into, and that is deliberate.
            </span>{" "}
            A key typed into a web form has to be stored — which puts it in the database, in every
            backup of the database, and within reach of every administrator. Keys live in the{" "}
            <span className="text-foreground">deployment environment</span> instead, where this
            application can use them but nobody can read them back out. This page reports whether a
            key is present. It cannot show you one.
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Integrations" subtitle="What the platform is connected to" />
        <ul className="flex flex-col gap-3">
          {integrations.map((i) => (
            <li
              key={i.name}
              className="rounded-[var(--radius-lg)] border border-border bg-elevated/30 px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-foreground">{i.name}</span>
                    {i.configured ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green/30 bg-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-green">
                        <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                        <XCircle className="h-2.5 w-2.5" strokeWidth={2.5} />
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">{i.what}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{i.how}</p>
                </div>
              </div>

              {i.env && (
                <div
                  className={cn(
                    "mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5",
                  )}
                >
                  <KeyRound className="h-3 w-3 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <code className="font-mono text-[11px] text-muted-foreground">{i.env}</code>
                  <span className="text-[11px] text-muted-foreground">
                    {i.configured ? (
                      "set in the deployment environment"
                    ) : (
                      <>
                        not set — add it in{" "}
                        <span className="text-foreground">Vercel → Settings → Environment Variables</span>
                        , then redeploy
                      </>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="mt-4">
        <PanelHeader title="If a key is exposed" subtitle="What to do, in order" />
        <ol className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted-foreground">
          {[
            "Revoke it at the source — the provider's console. Do this first: a revoked key cannot be used, wherever it has ended up.",
            "Issue a replacement.",
            "Update the environment variable in Vercel, then redeploy.",
          ].map((t, n) => (
            <li key={n} className="flex gap-2.5">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border font-mono text-[10px] text-muted-foreground">
                {n + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 border-t border-border/60 pt-3 text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Rotate first, investigate second.</span> A key that has been
          pasted into a chat, an email, a ticket or a screenshot should be treated as public, whether or
          not you think anyone saw it.
        </p>
      </Panel>
    </Content>
  );
}
