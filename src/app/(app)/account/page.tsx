import { LogOut, Moon } from "lucide-react";
import { getDataSource, getSnapshot } from "@/lib/data";
import { PROFILE } from "@/lib/profile";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  seed: "Demo / seed data",
  csv: "Practical CSV exports",
  odbc: "Civica Practical — live ODBC feed",
  feed: "Civica Practical — live feed",
};

export default async function AccountPage() {
  const source = getDataSource();
  const snapshot = await getSnapshot();
  const live = snapshot.period.live;
  const sourceLabel = live
    ? "Civica Practical — live feed (read-only)"
    : SOURCE_LABEL[source] ?? source;

  return (
    <Content className="max-w-3xl">
      {/* Profile */}
      <Panel className="mb-4">
        <PanelHeader title="Profile" subtitle="SIGNED-IN USER" />
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-sm font-semibold text-foreground">
            {PROFILE.initials}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-foreground">
              {PROFILE.name}
            </span>
            <span className="text-[13px] text-muted-foreground">{PROFILE.email}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {PROFILE.role}
            </span>
          </div>
        </div>
      </Panel>

      {/* Preferences */}
      <Panel className="mb-4">
        <PanelHeader title="Preferences" subtitle="APPEARANCE" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Moon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-[13px] text-foreground">Theme</span>
          </div>
          <span className="rounded-md border border-border bg-elevated px-2.5 py-1 text-xs font-medium text-foreground">
            Dark
          </span>
        </div>
      </Panel>

      {/* Data access */}
      <Panel className="mb-4">
        <PanelHeader title="Data Access" subtitle="CURRENT SOURCE" />
        <dl className="flex flex-col gap-3 text-[13px]">
          <Row label="Status" value={live ? "Live" : "Demo / seed"} />
          <Row label="Source" value={sourceLabel} />
          <Row label="Accounting system" value="Civica Practical Plus" />
          <Row label="Refresh" value="Automatic — twice daily (6am & 6pm)" />
          {snapshot.meta?.generatedAt && (
            <Row label="Last updated" value={snapshot.meta.generatedAt} />
          )}
        </dl>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Figures are read <span className="text-foreground">read-only</span> from
          Civica Practical on the council server and refreshed automatically — no
          manual export or upload.
        </p>
      </Panel>

      {/* Sign out */}
      <Panel>
        <PanelHeader
          title="Sign Out"
          subtitle="AUTHENTICATION COMING IN A LATER PHASE"
        />
        <button
          disabled
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2 text-[13px] font-medium text-muted-foreground opacity-70"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          Sign out
        </button>
        <p className="mt-2 text-[12px] text-muted-foreground">
          User accounts and sign-in will be enabled once authentication is added.
        </p>
      </Panel>
    </Content>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-[12px] text-foreground" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
