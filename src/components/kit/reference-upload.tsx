"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileJson, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Upload a reference file (department map / grant register).
 *
 * The file is validated on the server before it replaces anything, and a failed
 * validation changes nothing. Errors are shown in full rather than as "upload
 * failed" — the person fixing the spreadsheet needs to know which row is wrong.
 */

interface Result {
  ok: boolean;
  error?: string;
  errors?: string[];
  warnings?: string[];
  itemCount?: number;
}

function UploadBody({
  kind,
  title,
  description,
  currentLabel,
}: {
  kind: "department-map" | "grant-register";
  title: string;
  description: string;
  /** What's live right now, e.g. "171 accounts · bundled with the app". */
  currentLabel: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const upload = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setResult({ ok: false, error: `${file.name} isn't valid JSON.` });
        return;
      }

      const res = await fetch("/api/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, filename: file.name, payload }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (json.ok) startTransition(() => router.refresh());
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{description}</p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          id={`upload-${kind}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <label
          htmlFor={`upload-${kind}`}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium transition-colors",
            busy ? "cursor-wait opacity-60" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />}
          {busy ? "Validating…" : "Choose a .json file"}
        </label>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <FileJson className="h-3 w-3" strokeWidth={1.75} />
          validated before anything is replaced
        </span>
      </div>

      {result && (
        <div
          className={cn(
            "mt-4 rounded-md border px-3 py-2.5 text-[12px] leading-relaxed",
            result.ok ? "border-green/30 bg-green/5" : "border-red/30 bg-red/5",
          )}
        >
          <div className="flex items-start gap-2">
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green" strokeWidth={2} />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red" strokeWidth={2} />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold", result.ok ? "text-green" : "text-red")}>
                {result.ok
                  ? `Saved. ${result.itemCount} item(s) now live.`
                  : (result.error ?? "The file didn't validate.")}
              </p>

              {result.errors && result.errors.length > 0 && (
                <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-muted-foreground">
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-amber">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              {!result.ok && (
                <p className="mt-1.5 text-muted-foreground">The live data is unchanged.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The upload, as a BUTTON and a dialog.
 *
 * This used to be a full-width panel with a paragraph of explanation, sitting in
 * the middle of the Grant Tracker between the charts and the register. It is a
 * thing you do roughly once a year — when the Council issues a new grant register
 * — and it occupied prime screen space every single day in between.
 *
 * A button opens it. The explanation lives inside, where it is read at the moment
 * it is needed rather than skipped every morning.
 */
export function ReferenceUploadButton({
  kind,
  title,
  description,
  currentLabel,
  label = "Upload",
}: {
  kind: "department-map" | "grant-register";
  title: string;
  description: string;
  currentLabel: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-[rgba(255,255,255,0.2)] hover:text-foreground"
      >
        <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-200 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="mt-16 w-full max-w-xl rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-foreground">{title}</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {currentLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <UploadBody
              kind={kind}
              title={title}
              description={description}
              currentLabel={currentLabel}
            />
          </div>
        </div>
      )}
    </>
  );
}
