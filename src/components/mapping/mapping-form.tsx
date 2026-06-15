"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tags, Landmark, Search, RotateCcw, Save, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { BrandColor } from "@/lib/types";
import { Panel, PageIntro } from "@/components/kit/panel";
import { bgColor } from "@/lib/colors";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DeptOption {
  id: string;
  name: string;
  color: BrandColor;
  icon: string;
}

export interface AccountRow {
  code: string;
  originalName: string;
  originalDeptId: string;
  originalDeptName: string;
  amount: number;
  /** Current override name ("" = none). */
  name: string;
  /** Current override department id ("" = none). */
  departmentId: string;
}

export interface GrantRow {
  id: string;
  originalName: string;
  originalDeptId: string;
  originalDeptName: string;
  funder: string;
  total: number;
  name: string;
  departmentId: string;
}

type Edit = { name: string; departmentId: string };
type EditMap = Record<string, Edit>;

export function MappingForm({
  departments,
  accounts,
  grants,
  passwordRequired,
}: {
  departments: DeptOption[];
  accounts: AccountRow[];
  grants: GrantRow[];
  passwordRequired: boolean;
}) {
  const router = useRouter();
  const colorOf = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.color])) as Record<string, BrandColor>,
    [departments],
  );

  const initialAccounts = useMemo<EditMap>(
    () => Object.fromEntries(accounts.map((a) => [a.code, { name: a.name, departmentId: a.departmentId }])),
    [accounts],
  );
  const initialGrants = useMemo<EditMap>(
    () => Object.fromEntries(grants.map((g) => [g.id, { name: g.name, departmentId: g.departmentId }])),
    [grants],
  );
  const [acc, setAcc] = useState<EditMap>(initialAccounts);
  const [grt, setGrt] = useState<EditMap>(initialGrants);
  // The last-saved baseline, so "Discard" reverts to it (not all the way to the
  // original import) and the save bar knows when there are unsaved edits.
  const [saved, setSaved] = useState<{ a: EditMap; g: EditMap }>({ a: initialAccounts, g: initialGrants });
  const [tab, setTab] = useState<"accounts" | "grants">("accounts");
  const [query, setQuery] = useState("");
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── helpers ───────────────────────────────────────────────────────────────
  const accDirty = (a: AccountRow) => {
    const e = acc[a.code];
    return (!!e.name && e.name !== a.originalName) || (!!e.departmentId && e.departmentId !== a.originalDeptId);
  };
  const grtDirty = (g: GrantRow) => {
    const e = grt[g.id];
    return (!!e.name && e.name !== g.originalName) || (!!e.departmentId && e.departmentId !== g.originalDeptId);
  };
  const editedAccounts = accounts.filter(accDirty).length;
  const editedGrants = grants.filter(grtDirty).length;

  const hasUnsaved = JSON.stringify({ a: acc, g: grt }) !== JSON.stringify(saved);

  function setAccEdit(code: string, patch: Partial<Edit>, original: AccountRow) {
    setAcc((prev) => {
      const next = { ...prev[code], ...patch };
      // Picking the original department again clears the override.
      if (next.departmentId === original.originalDeptId) next.departmentId = "";
      return { ...prev, [code]: next };
    });
  }
  function setGrtEdit(id: string, patch: Partial<Edit>, original: GrantRow) {
    setGrt((prev) => {
      const next = { ...prev[id], ...patch };
      if (next.departmentId === original.originalDeptId) next.departmentId = "";
      return { ...prev, [id]: next };
    });
  }
  function revertAcc(code: string) {
    setAcc((prev) => ({ ...prev, [code]: { name: "", departmentId: "" } }));
  }
  function revertGrt(id: string) {
    setGrt((prev) => ({ ...prev, [id]: { name: "", departmentId: "" } }));
  }

  function buildPayload() {
    const accountsOut: Record<string, Edit> = {};
    for (const a of accounts) {
      const e = acc[a.code];
      const name = e.name.trim() && e.name.trim() !== a.originalName ? e.name.trim() : undefined;
      const departmentId = e.departmentId && e.departmentId !== a.originalDeptId ? e.departmentId : undefined;
      if (name || departmentId) accountsOut[a.code] = { name: name ?? "", departmentId: departmentId ?? "" };
    }
    const grantsOut: Record<string, Edit> = {};
    for (const g of grants) {
      const e = grt[g.id];
      const name = e.name.trim() && e.name.trim() !== g.originalName ? e.name.trim() : undefined;
      const departmentId = e.departmentId && e.departmentId !== g.originalDeptId ? e.departmentId : undefined;
      if (name || departmentId) grantsOut[g.id] = { name: name ?? "", departmentId: departmentId ?? "" };
    }
    return { accounts: accountsOut, grants: grantsOut };
  }

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password: password || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved({ a: acc, g: grt });
        setResult({
          ok: true,
          msg: `Saved — ${data.counts.accounts} account${data.counts.accounts === 1 ? "" : "s"} and ${data.counts.grants} grant${data.counts.grants === 1 ? "" : "s"} remapped. The dashboard now reflects your changes.`,
        });
        router.refresh();
      } else {
        setResult({ ok: false, msg: data.error ?? "Save failed." });
      }
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function discardAll() {
    setAcc(saved.a);
    setGrt(saved.g);
    setResult(null);
  }

  // ── filtering ───────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const visibleAccounts = accounts.filter((a) => {
    if (onlyEdited && !accDirty(a)) return false;
    if (!q) return true;
    return (
      a.code.toLowerCase().includes(q) ||
      a.originalName.toLowerCase().includes(q) ||
      (acc[a.code].name || "").toLowerCase().includes(q)
    );
  });
  const visibleGrants = grants.filter((g) => {
    if (onlyEdited && !grtDirty(g)) return false;
    if (!q) return true;
    return (
      g.originalName.toLowerCase().includes(q) ||
      g.funder.toLowerCase().includes(q) ||
      (grt[g.id].name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-24">
      <PageIntro>
        Rename cryptic or truncated accounts and grants, and reassign them to the right
        department. Changes overlay the imported data and{" "}
        <span className="text-foreground">survive every re-upload</span>.
      </PageIntro>

      <div className="flex items-center gap-2.5 rounded-lg border border-amber/30 bg-amber-dim/40 px-4 py-2.5 text-[12px] text-muted-foreground">
        <Info className="h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
        <span>Reassigning an account moves its amount too, so department totals recalculate.</span>
      </div>

      {/* Tabs + controls */}
      <Panel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-md border border-border bg-elevated/40 p-1">
            <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} icon={Tags} label="Accounts" count={accounts.length} edited={editedAccounts} />
            <TabButton active={tab === "grants"} onClick={() => setTab("grants")} icon={Landmark} label="Grants" count={grants.length} edited={editedGrants} />
          </div>

          <div className="flex items-center gap-2">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-44 rounded-md border border-border bg-elevated py-1.5 pl-8 pr-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40"
              />
            </label>
            <button
              type="button"
              onClick={() => setOnlyEdited((v) => !v)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                onlyEdited
                  ? "border-gold/40 bg-gold-dim text-gold-light"
                  : "border-border bg-elevated text-muted-foreground hover:text-foreground",
              )}
            >
              Edited only
            </button>
          </div>
        </div>

        {/* Table */}
        {tab === "accounts" ? (
          <MappingTable
            entityLabel="account"
            rows={visibleAccounts.map((a) => ({
              key: a.code,
              code: a.code,
              originalName: a.originalName,
              originalDeptId: a.originalDeptId,
              originalDeptName: a.originalDeptName,
              meta: formatCompact(a.amount),
              edit: acc[a.code],
              dirty: accDirty(a),
              onName: (v: string) => setAccEdit(a.code, { name: v }, a),
              onDept: (v: string) => setAccEdit(a.code, { departmentId: v }, a),
              onRevert: () => revertAcc(a.code),
            }))}
            departments={departments}
            colorOf={colorOf}
            metaHeader="YTD"
          />
        ) : (
          <MappingTable
            entityLabel="grant"
            rows={visibleGrants.map((g) => ({
              key: g.id,
              code: g.funder,
              originalName: g.originalName,
              originalDeptId: g.originalDeptId,
              originalDeptName: g.originalDeptName,
              meta: formatCompact(g.total),
              edit: grt[g.id],
              dirty: grtDirty(g),
              onName: (v: string) => setGrtEdit(g.id, { name: v }, g),
              onDept: (v: string) => setGrtEdit(g.id, { departmentId: v }, g),
              onRevert: () => revertGrt(g.id),
            }))}
            departments={departments}
            colorOf={colorOf}
            metaHeader="Funding"
            codeIsText
          />
        )}
      </Panel>

      {result && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-[13px]",
            result.ok ? "border-green/30 bg-green-dim/30" : "border-red/30 bg-red-dim/30",
          )}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red" />
          )}
          <span className={result.ok ? "text-foreground" : "text-red"}>{result.msg}</span>
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {editedAccounts + editedGrants > 0
              ? `${editedAccounts} account${editedAccounts === 1 ? "" : "s"} · ${editedGrants} grant${editedGrants === 1 ? "" : "s"} remapped`
              : "No changes"}
            {hasUnsaved && <span className="ml-2 text-amber">· unsaved</span>}
          </span>
          <div className="flex items-center gap-2.5">
            {passwordRequired && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-32 rounded-md border border-border bg-elevated px-3 py-1.5 text-[13px] text-foreground outline-none focus:border-gold/40"
              />
            )}
            <button
              type="button"
              onClick={discardAll}
              disabled={!hasUnsaved || busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!hasUnsaved || busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-1.5 text-[13px] font-semibold text-background transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? "Saving…" : "Save mappings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  edited,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Tags;
  label: string;
  count: number;
  edited: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
      <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
      {edited > 0 && (
        <span className="rounded-full bg-gold-dim px-1.5 font-mono text-[9px] font-semibold text-gold-light">
          {edited}
        </span>
      )}
    </button>
  );
}

interface TableRow {
  key: string;
  code: string;
  originalName: string;
  originalDeptId: string;
  originalDeptName: string;
  meta: string;
  edit: Edit;
  dirty: boolean;
  onName: (v: string) => void;
  onDept: (v: string) => void;
  onRevert: () => void;
}

function MappingTable({
  rows,
  departments,
  colorOf,
  entityLabel,
  metaHeader,
  codeIsText = false,
}: {
  rows: TableRow[];
  departments: DeptOption[];
  colorOf: Record<string, BrandColor>;
  entityLabel: string;
  metaHeader: string;
  codeIsText?: boolean;
}) {
  if (!rows.length) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        No {entityLabel}s match.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {[
              { label: codeIsText ? "Funder" : "Code", w: "w-[150px]" },
              { label: "Display name", w: "" },
              { label: "Department", w: "w-[220px]" },
              { label: metaHeader, w: "w-[90px] text-right" },
              { label: "", w: "w-[40px]" },
            ].map((h, i) => (
              <th
                key={i}
                className={cn(
                  "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#dce8f0]",
                  h.w,
                )}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const curDept = r.edit.departmentId || r.originalDeptId;
            return (
              <tr key={r.key} className={cn("group", r.dirty && "bg-gold-dim/20")}>
                <td className="border-b border-[rgba(255,255,255,0.05)] px-3 py-2.5 align-middle">
                  <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                </td>
                <td className="border-b border-[rgba(255,255,255,0.05)] px-3 py-2.5 align-middle">
                  <input
                    value={r.edit.name}
                    onChange={(e) => r.onName(e.target.value)}
                    placeholder={r.originalName}
                    className={cn(
                      "w-full rounded border bg-elevated/60 px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40",
                      r.edit.name && r.edit.name !== r.originalName ? "border-gold/30" : "border-border",
                    )}
                  />
                </td>
                <td className="border-b border-[rgba(255,255,255,0.05)] px-3 py-2.5 align-middle">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", bgColor[colorOf[curDept] ?? "gold"])} />
                    <select
                      value={curDept}
                      onChange={(e) => r.onDept(e.target.value)}
                      className={cn(
                        "w-full rounded border bg-elevated px-2 py-1.5 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40",
                        curDept !== r.originalDeptId ? "border-gold/30" : "border-border",
                      )}
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="border-b border-[rgba(255,255,255,0.05)] px-3 py-2.5 text-right align-middle">
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{r.meta}</span>
                </td>
                <td className="border-b border-[rgba(255,255,255,0.05)] px-3 py-2.5 align-middle">
                  {r.dirty && (
                    <button
                      type="button"
                      onClick={r.onRevert}
                      aria-label="Revert to original"
                      title="Revert to original"
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
