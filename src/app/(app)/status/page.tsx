import { Database, HardDrive, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { getSnapshot } from "@/lib/data";
import { snapshotOrigin } from "@/lib/data/db-source";
import { listSyncs } from "@/lib/sync-log";
import { listPeriods, isHistoryEnabled } from "@/lib/history";
import { isLedgerEnabled, queryTransactions } from "@/lib/ledger";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Data provenance. Answers, without anyone having to take it on trust:
 *   - where the figures on screen actually came from
 *   - when the last sync landed, to the minute
 *   - whether the ledger accepted the transactions that came with it
 *
 * "Data as at 9 Jul" can't distinguish the 06:00 sync from the 18:00 one, and a
 * push can succeed while the ledger silently stores nothing. Both are visible here.
 */
export default async function StatusPage() {
  // Read the snapshot first — that's what sets the origin.
  const snapshot = await getSnapshot();
  const origin = snapshotOrigin();

  const [syncs, periods] = await Promise.all([listSyncs(20), listPeriods()]);
  const ledger = isLedgerEnabled()
    ? await queryTransactions({ fyLabel: snapshot.period.fyLabel, limit: 1 })
    : null;

  const last = syncs[0];
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const ORIGINS = {
    postgres: { icon: Database, label: "Postgres (snapshots table)", tone: "text-green", note: "Source of truth." },
    blob: { icon: HardDrive, label: "Vercel Blob", tone: "text-amber", note: "Postgres unavailable — serving the fallback." },
    bundled: { icon: Package, label: "Bundled snapshot.json", tone: "text-red", note: "No live data at all — build-time fallback." },
  } as const;
  const o = ORIGINS[origin];
  const OriginIcon = o.icon;

  return (
    <Content>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Where this data comes from" />
          <div className="flex items-start gap-3">
            <OriginIcon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", o.tone)} strokeWidth={1.75} />
            <div>
              <div className={cn("text-[15px] font-semibold", o.tone)}>{o.label}</div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{o.note}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <Row label="Period on screen" value={`${snapshot.period.label} · ${snapshot.period.fyLabel}`} />
            <Row label="Built from Practical" value={fmt(last?.generatedAt ?? null)} />
            <Row label="Last push received" value={fmt(last?.receivedAt ?? null)} />
            <Row label="Snapshot history" value={isHistoryEnabled() ? `${periods.length} period(s) archived` : "not configured"} />
            <Row label="Transaction ledger" value={ledger ? `${ledger.total.toLocaleString()} rows this FY` : "not configured"} />
            <Row label="GLTRN high-water mark" value={last?.maxKy ? `ky ${last.maxKy.toLocaleString()}` : "—"} />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Last sync" subtitle={last ? fmt(last.receivedAt) : "no syncs recorded"} />
          {!last ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nothing logged yet. Run <span className="font-mono">scripts/sync-log-schema.sql</span> in
              Neon, then push a snapshot.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <Check
                ok={last.archived}
                good="Period archived to the snapshots table"
                bad="Period NOT archived — the period selector won't grow"
              />
              <Check
                ok={last.txnsSent === 0 || last.txnsIngested >= last.txnsSent}
                good={`Ledger stored ${last.txnsIngested.toLocaleString()} of ${last.txnsSent.toLocaleString()} transactions sent`}
                bad={`Ledger stored only ${last.txnsIngested.toLocaleString()} of ${last.txnsSent.toLocaleString()} sent — the sync cursor is held, so nothing is lost, but DATABASE_URL is probably missing`}
              />
              <Check ok={origin === "postgres"} good="Dashboard is reading from Postgres" bad={`Dashboard is reading from ${origin}`} />
            </div>
          )}
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader title="Sync history" subtitle={`${syncs.length} most recent`} />
        {syncs.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">No syncs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  {["Received", "Built at", "Period", "Sent", "Stored", "Archived", "Store"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#dce8f0]",
                        i >= 3 && i <= 4 ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syncs.map((s) => {
                  const lost = s.txnsSent > 0 && s.txnsIngested < s.txnsSent;
                  return (
                    <tr key={s.id} className="hover:bg-[rgba(255,255,255,0.03)]">
                      <Td>{fmt(s.receivedAt)}</Td>
                      <Td muted>{fmt(s.generatedAt)}</Td>
                      <Td>{s.periodLabel ?? "—"}</Td>
                      <Td right>{s.txnsSent.toLocaleString()}</Td>
                      <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-right">
                        <span className={cn("font-mono text-[12px] tabular-nums", lost ? "text-amber" : "text-foreground")}>
                          {s.txnsIngested.toLocaleString()}
                        </span>
                      </td>
                      <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2">
                        {s.archived ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green" strokeWidth={2} />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber" strokeWidth={2} />
                        )}
                      </td>
                      <Td muted>{s.store ?? "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Content>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono text-[12px] tabular-nums text-foreground">{value}</dd>
    </>
  );
}

function Check({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green" strokeWidth={2} />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber" strokeWidth={2} />
      )}
      <span className={cn("text-[12px] leading-relaxed", ok ? "text-muted-foreground" : "text-amber")}>
        {ok ? good : bad}
      </span>
    </div>
  );
}

function Td({ children, muted, right }: { children: React.ReactNode; muted?: boolean; right?: boolean }) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-[rgba(255,255,255,0.04)] px-3 py-2 font-mono text-[12px] tabular-nums",
        right && "text-right",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {children}
    </td>
  );
}
