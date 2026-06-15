"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { Panel, PanelHeader, PageIntro } from "@/components/kit/panel";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UploadResult {
  ok: boolean;
  error?: string;
  store?: string;
  classified?: { name: string; kind: string }[];
  summary?: {
    departments: number;
    grants: number;
    revenueLines: number;
    baseline: string;
    totalYtdSpend: number;
  };
}

const REQUIRED = [
  { kind: "byFunction", label: "Analysis by Function (Note 3a)", required: true, note: "The department breakdown" },
  { kind: "income", label: "Income Statement", required: false, note: "Council revenue lines + totals" },
  { kind: "grants", label: "Grants — Note 5", required: false, note: "Grant funding by program" },
  { kind: "byFunction (FY25)", label: "FY25 Analysis by Function", required: false, note: "Gives a FY25 budget baseline" },
];

export function UploadForm({
  store,
  passwordRequired,
}: {
  store: string;
  passwordRequired: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const ACCEPTED = /\.(xls|xlsx|csv)$/i;

  /** Merge picked/dropped files into the selection, keeping only spreadsheets. */
  function addFiles(incoming: FileList | File[] | null) {
    const next = Array.from(incoming ?? []).filter((f) => ACCEPTED.test(f.name));
    if (!next.length) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...next.filter((f) => !seen.has(f.name + f.size))];
    });
  }

  function removeFile(name: string, size: number) {
    setFiles((prev) => prev.filter((f) => !(f.name === name && f.size === size)));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      if (password) fd.append("password", password);
      const res = await fetch("/api/feed/upload", { method: "POST", body: fd });
      const data: UploadResult = await res.json();
      setResult(data);
      if (data.ok) {
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh(); // re-render server components with the new data
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const totalKb = files.reduce((sum, f) => sum + f.size, 0) / 1024;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageIntro>
        Drop your Practical exports below to refresh the dashboard. Files are identified by
        their content, not their name, so the order doesn&apos;t matter.
      </PageIntro>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: upload zone */}
        <Panel className="flex flex-col">
          <PanelHeader
            title="Upload Practical exports"
            subtitle="Update the dashboard from your exports"
          />

          {/* Drag-and-drop / click zone */}
          <label
            htmlFor="feed-files"
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => {
              // Only deactivate when the cursor leaves the whole zone (not a child).
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
            }}
            onDrop={onDrop}
            className={cn(
              "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed px-6 py-14 text-center transition-colors",
              dragActive
                ? "border-gold bg-gold-dim"
                : "border-border bg-elevated/30 hover:border-gold/40 hover:bg-elevated/60",
            )}
          >
            <span
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full border transition-colors",
                dragActive
                  ? "border-gold/40 bg-gold-dim"
                  : "border-border bg-elevated group-hover:border-gold/30",
              )}
            >
              <UploadCloud
                className={cn("h-7 w-7 transition-colors", dragActive ? "text-gold-light" : "text-gold")}
                strokeWidth={1.5}
              />
            </span>
            <span className="text-sm font-medium text-foreground">
              {dragActive ? "Drop the files here" : "Drag & drop files, or click to choose"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              .XLS · .XLSX · .CSV — drop all your exports at once
            </span>
            <input
              id="feed-files"
              ref={inputRef}
              type="file"
              multiple
              accept=".xls,.xlsx,.csv"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>

          {files.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {files.length} file{files.length > 1 ? "s" : ""} · {totalKb.toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-red"
                >
                  Clear all
                </button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {files.map((f) => (
                  <li
                    key={f.name + f.size}
                    className="flex items-center gap-2.5 rounded-md border border-border bg-elevated/40 px-3 py-2 text-[13px] text-foreground"
                  >
                    <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-teal" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.name, f.size)}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-red"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {passwordRequired && (
            <input
              type="password"
              placeholder="Upload password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-4 w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-gold/40"
            />
          )}

          <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
            <button
              onClick={submit}
              disabled={busy || files.length === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-background transition-colors",
                "hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
              {busy
                ? "Processing…"
                : files.length
                  ? `Upload ${files.length} file${files.length > 1 ? "s" : ""}`
                  : "Upload"}
            </button>
            {store === "local-file" && (
              <span className="font-mono text-[10px] text-muted-foreground">
                dev — saving locally
              </span>
            )}
          </div>
        </Panel>

        {/* Right: what to upload */}
        <Panel className="flex flex-col self-start">
          <PanelHeader title="What to upload" subtitle="From Practical → Financial Reporting" />
          <ul className="flex flex-col gap-2">
            {REQUIRED.map((r) => (
              <li
                key={r.kind}
                className="flex items-start gap-2.5 rounded-md border border-border bg-elevated/30 px-3 py-2.5 text-[13px]"
              >
                <span
                  className={cn(
                    "mt-0.5 rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide",
                    r.required ? "bg-red-dim text-red" : "bg-elevated text-muted-foreground",
                  )}
                >
                  {r.required ? "REQUIRED" : "OPTIONAL"}
                </span>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{r.label}</span>
                  <span className="text-[12px] text-muted-foreground">{r.note}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Re-uploading replaces the live data.
          </p>
        </Panel>
      </div>

      {result && (
        <Panel className={cn(result.ok ? "border-green/30" : "border-red/30")}>
          <div className="flex items-start gap-3">
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {result.ok ? "Dashboard updated" : "Upload failed"}
              </p>
              {result.error && (
                <p className="mt-1 text-[13px] text-red">{result.error}</p>
              )}
              {result.summary && (
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {result.summary.departments} departments · {result.summary.grants} grants ·{" "}
                  {formatCurrency(result.summary.totalYtdSpend)} YTD spend · baseline:{" "}
                  {result.summary.baseline}
                </p>
              )}
              {result.classified && result.classified.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {result.classified.map((c, i) => (
                    <li key={i} className="font-mono text-[11px] text-muted-foreground">
                      <span className="text-foreground">{c.name}</span> → {c.kind}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
