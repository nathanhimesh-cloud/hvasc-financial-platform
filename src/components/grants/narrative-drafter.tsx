"use client";

import { useActionState, useState } from "react";
import { Sparkles, Copy, Check, AlertTriangle } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { generateNarrative, type NarrativeState } from "@/app/(app)/grants/narrative-actions";

const initial: NarrativeState = { error: "" };

/**
 * Draft an acquittal narrative (B5 "Premium").
 *
 * The word DRAFT appears on the panel, on the button, and above the output. That is
 * not decoration. A paragraph that reads like a finished acquittal, sitting inside
 * the Council's own reporting platform, will be pasted into a funding report by
 * somebody in a hurry — so it has to look like something that still needs a signature.
 */
export function NarrativeDrafter({
  grants,
  configured,
}: {
  grants: { id: string; name: string }[];
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(generateNarrative, initial);
  const [copied, setCopied] = useState(false);

  return (
    <Panel>
      <PanelHeader
        title="Draft an acquittal narrative"
        subtitle="AI-assisted — always check before it leaves the building"
        right={<Sparkles className="h-4 w-4 text-gold" strokeWidth={1.75} />}
      />

      {!configured ? (
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-elevated/40 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Not configured.</span> An administrator needs to set{" "}
            <code className="font-mono text-[11px] text-foreground">ANTHROPIC_API_KEY</code> in the
            deployment environment. See <span className="text-foreground">Settings → Integrations</span>.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
            Every figure in the draft is taken from the general ledger and handed to the model already
            calculated. <span className="text-foreground">It is not permitted to compute a number</span>
            , and it is told nothing about the project&apos;s activities — only its financial position.
            What comes back is a starting paragraph, not an acquittal.
          </p>

          <form action={action} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Grant
              </span>
              <select
                name="grantId"
                defaultValue={state.grantId ?? ""}
                className="h-[38px] w-full rounded-md border border-border bg-elevated px-3 text-[13px] text-foreground outline-none focus:border-gold/40"
              >
                <option value="" disabled>
                  Choose a grant…
                </option>
                {grants.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-[38px] items-center gap-1.5 rounded-md bg-gold px-3 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              {pending ? "Drafting…" : "Draft"}
            </button>
          </form>

          {state.error && (
            <p className="mt-3 rounded-md border border-red/25 bg-red/[0.04] px-3 py-2.5 text-[12px] leading-relaxed text-red">
              {state.error}
            </p>
          )}

          {state.draft && (
            <div className="mt-4 rounded-md border border-gold/25 bg-gold/[0.03] px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-gold">
                  Draft — not checked, not final
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(state.draft!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green" strokeWidth={2} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              {state.draft.split("\n\n").map((para, i) => (
                <p key={i} className="mb-2 text-[13px] leading-relaxed text-foreground last:mb-0">
                  {para}
                </p>
              ))}
              <p className="mt-3 border-t border-gold/20 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Check every figure against the register before this goes to a funder. The platform
                wrote it; <span className="text-foreground">you sign it</span>.
              </p>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
