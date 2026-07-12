"use client";

import { useActionState, useState } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
import { addUser, type UserActionState } from "@/app/(app)/users/actions";

const initial: UserActionState = { error: "" };

/**
 * Create a user.
 *
 * We generate the temporary password rather than letting an admin type one, and we
 * show it EXACTLY ONCE. An admin who invents a password invents a memorable one,
 * writes it in an email, and it lives in that inbox forever. A generated one is
 * random, has to be copied deliberately, and is dead the moment they log in — the
 * account is flagged `must_change_password`, so it survives one use.
 */
export function AddUserForm({ roles }: { roles: { id: string; label: string; description: string }[] }) {
  const [state, action, pending] = useActionState(addUser, initial);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Username
          </span>
          <input
            name="username"
            placeholder="m.smith"
            className="w-56 rounded-md border border-border bg-elevated px-3 py-2 text-[13px] text-foreground outline-none focus:border-gold/40"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Role
          </span>
          <select
            name="role"
            defaultValue=""
            className="h-[38px] w-64 rounded-md border border-border bg-elevated px-3 text-[13px] text-foreground outline-none focus:border-gold/40"
          >
            <option value="" disabled>
              Choose a role…
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-md bg-gold px-3 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          {pending ? "Creating…" : "Create"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-[13px] text-red">{state.error}</p>}

      {/* Shown once. It is not stored in the clear and cannot be shown again. */}
      {state.tempPassword && (
        <div className="mt-4 rounded-md border border-green/30 bg-green/[0.04] px-3.5 py-3">
          <p className="text-[13px] font-semibold text-green">{state.ok}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Give them this temporary password. It is shown{" "}
            <span className="text-foreground">once and only once</span> — it is not stored anywhere in
            readable form. They must set their own at first login, and turn on MFA.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="flex-1 rounded border border-border bg-elevated px-3 py-2 font-mono text-[14px] tracking-wide text-foreground">
              {state.tempPassword}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(state.tempPassword!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
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
        </div>
      )}
    </>
  );
}
