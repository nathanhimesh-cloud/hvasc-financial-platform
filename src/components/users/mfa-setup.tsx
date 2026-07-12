"use client";

import { useActionState, useState, useEffect } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { ShieldCheck, ShieldOff, Copy, Check, AlertTriangle } from "lucide-react";
import { beginMfa, confirmMfa, turnOffMfa, type MfaSetupState } from "@/app/(app)/account/mfa-actions";

const initial: MfaSetupState = { error: "" };

/**
 * Turn on the second factor (Build Brief B9).
 *
 * The QR is rendered in the BROWSER, from the `otpauth://` URI. That matters: the
 * secret never goes to a third-party chart service, and it never sits in an image
 * on a CDN. It goes from our server, to this page, to the user's phone camera.
 */
export function MfaSetup({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<MfaSetupState | null>(null);
  const [state, action, pending] = useActionState(confirmMfa, initial);
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // The live state is whichever step we're on: the freshly-begun setup, or the
  // server's response to a code attempt (which re-sends the URI on failure).
  const live = state.uri ? state : setup;

  useEffect(() => {
    if (!live?.uri) {
      setQr("");
      return;
    }
    void QRCode.toDataURL(live.uri, {
      width: 200,
      margin: 1,
      color: { dark: "#e8e8e8", light: "#00000000" },
    }).then(setQr);
  }, [live?.uri]);

  // ── already on ───────────────────────────────────────────────────────────
  if (enabled && !state.done) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-green" strokeWidth={2} />
          <span className="text-[13px] text-foreground">
            Two-factor authentication is <span className="text-green">on</span>.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm("Turn off two-factor authentication? Your account will be less secure.")) {
              void turnOffMfa();
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:border-red/30 hover:text-red"
        >
          <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.75} />
          Turn off
        </button>
      </div>
    );
  }

  // ── just finished: the recovery codes, shown once ────────────────────────
  if (state.done && state.recoveryCodes) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-green" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-green">
            Two-factor authentication is on.
          </span>
        </div>

        <div className="rounded-md border border-amber/30 bg-amber/[0.04] px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground">
                Save these recovery codes now. They are shown once.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Each one signs you in <span className="text-foreground">once</span> if you lose your
                phone. Without them, only an administrator can get you back in. Print them, or put
                them in a password manager — not in your email.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {state.recoveryCodes.map((c) => (
                  <code
                    key={c}
                    className="rounded border border-border bg-elevated px-2 py-1.5 text-center font-mono text-[12px] text-foreground"
                  >
                    {c}
                  </code>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(state.recoveryCodes!.join("\n"));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green" strokeWidth={2} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Copy all
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── mid-enrolment: scan, then prove it ──────────────────────────────────
  if (live?.uri) {
    return (
      <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qr && (
          <div className="flex-shrink-0 rounded-md border border-border bg-elevated p-3">
            <Image src={qr} alt="Scan this with your authenticator app" width={180} height={180} unoptimized />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">1.</span> Scan this with Google Authenticator, Microsoft
            Authenticator, 1Password — any authenticator app.
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Camera not cooperating? Enter this key by hand:{" "}
            <code className="font-mono text-[11px] text-foreground">{live.secret}</code>
          </p>

          <p className="mt-3 text-[13px] text-muted-foreground">
            <span className="text-foreground">2.</span> Enter the 6-digit code it shows.
          </p>

          <div className="mt-2 flex items-center gap-2">
            <input
              name="code"
              autoFocus
              inputMode="numeric"
              placeholder="000000"
              className="w-36 rounded-md border border-border bg-elevated px-3 py-2 text-center font-mono text-[16px] tracking-[0.25em] text-foreground outline-none focus:border-gold/40"
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-[38px] items-center gap-1.5 rounded-md bg-gold px-3 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              {pending ? "Checking…" : "Turn on"}
            </button>
          </div>

          {state.error && <p className="mt-2 text-[12px] text-red">{state.error}</p>}
        </div>
      </form>
    );
  }

  // ── off: offer to start ─────────────────────────────────────────────────
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <ShieldOff className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={2} />
        <div>
          <div className="text-[13px] text-foreground">Two-factor authentication is off.</div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            A password alone protects the Council&apos;s whole financial position. Add a second factor.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void beginMfa().then(setSetup)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:border-[rgba(255,255,255,0.2)]"
      >
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
        Set up
      </button>
    </div>
  );
}
