"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { changePassword, type ChangeState } from "./actions";

const initial: ChangeState = { error: "" };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initial);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          className="rounded-md border border-border bg-elevated px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-gold/40"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Confirm password</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          className="rounded-md border border-border bg-elevated px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-gold/40"
        />
      </label>

      {state.error && <p className="text-[13px] text-red">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-[14px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <KeyRound className="h-4 w-4" strokeWidth={2} />
        {pending ? "Saving…" : "Save password"}
      </button>
      <p className="text-center font-mono text-[10px] text-muted-foreground">Minimum 10 characters.</p>
    </form>
  );
}
