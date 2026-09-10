"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tags, Landmark, Search, RotateCcw, Save, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { BrandColor } from "@/lib/types";
import { Panel, PageIntro } from "@/components/kit/panel";
import { TablePager, usePagination, STICKY_HEAD } from "@/components/kit/table-pager";
import { ExportButton } from "@/components/kit/export-button";
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
  /** GLMST.ACCNTTYPE: 5 → revenue, 6 → expense. Splits the unmapped exports. */
  kind: "revenue" | "expense";
  /** Annual budget on the account (GLBAL.BUDGET at period 12). */
  budget: number;
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

/**
 * Where each exported column comes from in Practical, written onto the About
 * sheet of every workbook this page produces. An export outlives the screen it
 * came from, and "where did this number come from" should be answerable by the
 * person holding the file rather than by asking us.
 */
const PRACTICAL_SOURCE: [string, string][] = [
  ["Chart of accounts", "GLMST — one row per general-ledger account"],
  ["GL code", "GLMST.GLACCOUNT (e.g. 7015-1100-0000)"],
  ["Account name", "GLMST.DESCRIPT"],
  ["Revenue vs expense", "GLMST.ACCNTTYPE — 5 = revenue, 6 = expense"],
  ["YTD balance", "GLBAL.BALANCE at the current period (cumulative year to date, not the month)"],
  ["Active accounts only", "GLMST.RECACTIVE = 'Y' and GLMST.ISCONTROL = 'Y'"],
  [
    "Directorate mapping",
    "CVREPORTGROUP + CVREPORTGROUPLINK — Practical's Report Groups screen, joined on GLMST.KY",
  ],
  [
    "Why an account is unmapped",
    "It is not a member of any Report Group matching a directorate (Corporate Services-Finance / Operations Manager / Social Services Director)",
  ],
  ["To fix", "Add the account to the right Report Group in Practical; it moves on the next sync"],
];

export function MappingForm({
  departments,
  accounts,
  grants,
  passwordRequired,
  periodLabel,
  generatedAt,
}: {
  departments: DeptOption[];
  accounts: AccountRow[];
  grants: GrantRow[];
  passwordRequired: boolean;
  /** Stamped onto the unmapped exports so a downloaded file dates itself. */
  periodLabel?: string;
  generatedAt?: string;
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
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  // Revenue / expense split within the unmapped list. Reset when the toggle goes
  // off so turning it back on does not resume a filter nobody can see.
  const [kindFilter, setKindFilter] = useState<"all" | "revenue" | "expense">("all");
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
  // "Unmapped" = the department map couldn't resolve it, so it has no original
  // department (shown as "Unmapped"). These are the ones behind the dashboard's
  // "Unassigned" / "Other revenue" lines — the accounts most needing a decision.
  const unmappedList = accounts.filter((a) => !a.originalDeptId);
  const unmappedAccounts = unmappedList.length;
  const unmappedRevenue = unmappedList.filter((a) => a.kind === "revenue").length;
  const unmappedExpense = unmappedList.filter((a) => a.kind === "expense").length;
  const unmappedGrants = grants.filter((g) => !g.originalDeptId).length;
  const unmappedCount = tab === "accounts" ? unmappedAccounts : unmappedGrants;

  const q = query.trim().toLowerCase();
  const visibleAccounts = accounts.filter((a) => {
    const isUnmapped = !a.originalDeptId;
    // Unmapped rows are HIDDEN from the default list — they surface only when the
    // "Unmapped" toggle is on (which in turn hides the mapped ones). An account you
    // have already edited stays visible either way, so your change never disappears.
    if (onlyUnmapped ? !isUnmapped : isUnmapped && !accDirty(a)) return false;
    if (onlyEdited && !accDirty(a)) return false;
    if (onlyUnmapped && kindFilter !== "all" && a.kind !== kindFilter) return false;
    if (!q) return true;
    return (
      a.code.toLowerCase().includes(q) ||
      a.originalName.toLowerCase().includes(q) ||
      (acc[a.code].name || "").toLowerCase().includes(q)
    );
  });
  const visibleGrants = grants.filter((g) => {
    const isUnmapped = !g.originalDeptId;
    if (onlyUnmapped ? !isUnmapped : isUnmapped && !grtDirty(g)) return false;
    if (onlyEdited && !grtDirty(g)) return false;
    if (!q) return true;
    return (
      g.originalName.toLowerCase().includes(q) ||
      g.funder.toLowerCase().includes(q) ||
      (grt[g.id].name || "").toLowerCase().includes(q)
    );
  });

  // Page each list; reset to page 1 whenever a filter changes so you never land on
  // a now-empty page.
  // Department id → name, for naming the target of a reassignment in an export.
  const deptNameById: Record<string, string> = Object.fromEntries(departments.map((d) => [d.id, d.name]));

  // Name the file after what's actually in it, so two downloads from the same
  // page don't land in Downloads as "…(1).xlsx" with no way to tell them apart.
  const accountExportName = onlyUnmapped
    ? kindFilter === "revenue"
      ? "hvasc-unmapped-revenue"
      : kindFilter === "expense"
        ? "hvasc-unmapped-expenses"
        : "hvasc-unmapped-accounts"
    : "hvasc-account-mapping";

  const resetKey = `${q}|${onlyEdited}|${onlyUnmapped}|${kindFilter}`;
  const pagedAccounts = usePagination(visibleAccounts, { size: 50, resetKey });
  const pagedGrants = usePagination(visibleGrants, { size: 50, resetKey });
  const paged = tab === "accounts" ? pagedAccounts : pagedGrants;

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
              onClick={() => setOnlyUnmapped((v) => { if (v) setKindFilter("all"); return !v; })}
              title="Show only accounts the department map couldn't resolve — the ones behind the dashboard's Unassigned / Other revenue lines."
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                onlyUnmapped
                  ? "border-amber/50 bg-amber-dim text-amber"
                  : "border-border bg-elevated text-muted-foreground hover:text-foreground",
              )}
            >
              <AlertTriangle className="h-3 w-3" strokeWidth={2} />
              Unmapped ({unmappedCount})
            </button>
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

            {/* Revenue / expense split. Only meaningful while "Unmapped" is on:
                that's the list someone is actually working through, and the two
                halves are different conversations — unmapped revenue is the
                dashboard's "Council-wide & unmapped" line and reads positive,
                unmapped expenses are the "Unassigned" line and at Hope Vale read
                NEGATIVE (they're credit-side payroll recovery accounts). */}
            {tab === "accounts" && onlyUnmapped && (
              <div className="flex items-center overflow-hidden rounded-md border border-border">
                {(["all", "revenue", "expense"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKindFilter(k)}
                    className={cn(
                      "px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                      kindFilter === k
                        ? "bg-gold-dim text-gold-light"
                        : "bg-elevated text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k === "all" ? `All ${unmappedAccounts}` : k === "revenue" ? `Revenue ${unmappedRevenue}` : `Expenses ${unmappedExpense}`}
                  </button>
                ))}
              </div>
            )}

            {/* Exports what's ON SCREEN, filters and all — so "Unmapped" + Export
                gives exactly the list to send Micah, rather than the whole chart of
                accounts he then has to filter again. */}
            {tab === "accounts" ? (
              <ExportButton<AccountRow>
                filename={accountExportName}
                meta={{ period: periodLabel, generatedAt, notes: PRACTICAL_SOURCE }}
                sheets={[
                  {
                    name: onlyUnmapped ? "Unmapped" : "Accounts",
                    rows: visibleAccounts,
                    columns: [
                      { header: "GL code", value: (a) => a.code, width: 18 },
                      { header: "Account name", value: (a) => acc[a.code]?.name || a.originalName, width: 40 },
                      { header: "Imported name", value: (a) => a.originalName, width: 40 },
                      { header: "Type", value: (a) => (a.kind === "revenue" ? "Revenue" : "Expense"), width: 10 },
                      { header: "Department", value: (a) => a.originalDeptName, width: 22 },
                      { header: "Reassigned to", value: (a) => deptNameById[acc[a.code]?.departmentId ?? ""] ?? "", width: 22 },
                      { header: "YTD", value: (a) => a.amount, type: "money", width: 16 },
                      { header: "Annual budget", value: (a) => a.budget || null, type: "money", width: 16 },
                    ],
                  },
                ]}
              />
            ) : (
              <ExportButton<GrantRow>
                filename="hvasc-grant-mapping"
                sheets={[
                  {
                    name: "Grants",
                    rows: visibleGrants,
                    columns: [
                      { header: "Grant", value: (g) => grt[g.id]?.name || g.originalName, width: 40 },
                      { header: "Imported name", value: (g) => g.originalName, width: 40 },
                      { header: "Funder", value: (g) => g.funder, width: 28 },
                      { header: "Department", value: (g) => g.originalDeptName, width: 22 },
                      { header: "Reassigned to", value: (g) => deptNameById[grt[g.id]?.departmentId ?? ""] ?? "", width: 22 },
                      { header: "Total", value: (g) => g.total, type: "money", width: 16 },
                    ],
                  },
                ]}
              />
            )}
          </div>
        </div>

        {/* Table — paged, with a sticky rows-per-page + page-number bar. */}
        <TablePager
          total={paged.total}
          page={paged.page}
          pageSize={paged.pageSize}
          pages={paged.pages}
          onPage={paged.setPage}
          onPageSize={paged.setPageSize}
          label={tab === "accounts" ? "accounts" : "grants"}
        />
        {tab === "accounts" ? (
          <MappingTable
            entityLabel="account"
            rows={pagedAccounts.pageItems.map((a) => ({
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
            rows={pagedGrants.pageItems.map((g) => ({
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

        {/* Second pager below the table. With 225 accounts at 50 a page, paging
            from the top means scrolling back up for every page — and the bar is
            no longer sticky, so it isn't waiting there when you reach the end. */}
        {paged.pages > 1 && (
          <TablePager
            border="top"
            total={paged.total}
            page={paged.page}
            pageSize={paged.pageSize}
            pages={paged.pages}
            onPage={(p) => {
              paged.setPage(p);
              // Back to the top of the list — a new page that starts mid-scroll
              // looks like the same page with different numbers.
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onPageSize={paged.setPageSize}
            label={tab === "accounts" ? "accounts" : "grants"}
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
                  "border-b border-[var(--hairline)] px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--th-fg)]",
                  STICKY_HEAD,
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
                <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 align-middle">
                  <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                </td>
                <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 align-middle">
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
                <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 align-middle">
                  <div className="flex items-center gap-2">
                    {/* An unmapped row has no department (value ""); without an
                        explicit option a <select> silently shows the first one, so
                        unmapped accounts looked like "Corporate Services". Now they
                        read as "Unmapped" in amber until a department is picked. */}
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", curDept ? bgColor[colorOf[curDept] ?? "gold"] : "bg-amber")} />
                    <select
                      value={curDept}
                      onChange={(e) => r.onDept(e.target.value)}
                      className={cn(
                        "w-full rounded border bg-elevated px-2 py-1.5 text-[13px] outline-none transition-colors focus:border-gold/40",
                        curDept ? "text-foreground" : "text-amber",
                        curDept !== r.originalDeptId ? "border-gold/30" : "border-border",
                      )}
                    >
                      {!curDept && <option value="">— Unmapped · pick a department —</option>}
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 text-right align-middle">
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{r.meta}</span>
                </td>
                <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 align-middle">
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
