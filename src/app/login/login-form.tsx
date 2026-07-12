"use client";

import { useActionState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { login, verifyCode, type LoginState } from "./actions";

const initial: LoginState = { error: "" };

/**
 * Sign in — one step, or two when MFA is on.
 *
 * The two steps are two SEPARATE server actions with separate state. Step two does
 * not re-post the password, and does not carry a hidden "step one passed" flag —
 * the client's word for that is worth nothing. What proves it is a short-lived
 * signed cookie the server issued when the password checked out, which grants no
 * access to anything and expires in five minutes.
 *
 * The second step also SAYS the password was accepted. A form that silently changes
 * to ask for something else reads as a failed login, and people start retyping their
 * password into the code box.
 */
export function LoginForm() {
  const [pwState, pwAction, pwPending] = useActionState(login, initial);
  const [codeState, codeAction, codePending] = useActionState(verifyCode, initial);

  // Step two ends when the server says the ticket is gone (needsCode goes false) —
  // at which point we drop back to the password form with its message.
  const onCodeStep = pwState.needsCode && codeState.needsCode !== false;

  if (onCodeStep) {
    return (
      <form action={codeAction} className="flex w-full flex-col gap-4">
        <div className="flex items-start gap-2.5 rounded-md border border-green/25 bg-green/[0.04] px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green" strokeWidth={2} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Password accepted.</span> Enter the 6-digit code from
            your authenticator app — or one of your recovery codes if you don&apos;t have your phone.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Authentication code
          </span>
          <input
            name="code"
            autoFocus
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="000000"
            className="rounded-md border border-border bg-elevated px-3 py-2.5 text-center font-mono text-[18px] tracking-[0.3em] text-foreground outline-none transition-colors focus:border-gold/40"
          />
        </label>

        {codeState.error && <p className="text-[13px] text-red">{codeState.error}</p>}

        <button
          type="submit"
          disabled={codePending}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-[14px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" strokeWidth={2} />
          {codePending ? "Verifying…" : "Verify"}
        </button>
      </form>
    );
  }

  return (
    <form action={pwAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Username</span>
        <input
          name="username"
          autoComplete="username"
          autoFocus
          className="rounded-md border border-border bg-elevated px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-gold/40"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="rounded-md border border-border bg-elevated px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-gold/40"
        />
      </label>

      {/* The session-expired message from step two lands here, on the form the user
          now needs to use. */}
      {(pwState.error || codeState.error) && (
        <p className="text-[13px] text-red">{pwState.error || codeState.error}</p>
      )}

      <button
        type="submit"
        disabled={pwPending}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-[14px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <LogIn className="h-4 w-4" strokeWidth={2} />
        {pwPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
