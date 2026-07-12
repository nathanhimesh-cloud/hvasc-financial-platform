"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff, Ban, RotateCcw, KeyRound, Copy, Check } from "lucide-react";
import { suspend, restore, changeRole, resetUserPassword, clearMfa } from "@/app/(app)/users/actions";
import type { AdminUser } from "@/lib/auth/db";
import { cn } from "@/lib/utils";

/**
 * The user list, and the four things an admin can do to a row.
 *
 * The destructive one — suspend — is the one the brief asks for by name ("Admins
 * can remove anyone instantly"), and it is deliberately NOT a delete. A deleted
 * user takes their audit trail's meaning with them; a suspended one is locked out
 * on their very next request while every action they ever took stays on the record.
 */
export function UsersTable({
  users,
  currentUserId,
  roles,
}: {
  users: AdminUser[];
  currentUserId: number;
  roles: { id: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [newPw, setNewPw] = useState<{ id: number; pw: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <th className="pb-2 text-left font-normal">User</th>
            <th className="pb-2 text-left font-normal">Role</th>
            <th className="pb-2 text-left font-normal">MFA</th>
            <th className="pb-2 text-left font-normal">Last login</th>
            <th className="pb-2 text-right font-normal">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const suspended = !!u.suspendedAt;
            return (
              <tr
                key={u.id}
                className={cn("border-b border-border/50 last:border-0", suspended && "opacity-55")}
              >
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{u.username}</span>
                    {isSelf && (
                      <span className="rounded border border-border px-1.5 py-px font-mono text-[9px] uppercase text-muted-foreground">
                        you
                      </span>
                    )}
                    {suspended && (
                      <span className="rounded border border-red/30 bg-red/10 px-1.5 py-px font-mono text-[9px] uppercase text-red">
                        suspended
                      </span>
                    )}
                    {u.mustChangePassword && !suspended && (
                      <span className="rounded border border-amber/30 bg-amber/10 px-1.5 py-px font-mono text-[9px] uppercase text-amber">
                        must set password
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    added {fmt(u.createdAt)}
                    {u.createdBy && ` by ${u.createdBy}`}
                  </div>
                </td>

                <td className="py-2.5 pr-4">
                  <select
                    value={u.role}
                    disabled={pending || suspended}
                    onChange={(e) =>
                      startTransition(async () => {
                        try {
                          await changeRole(u.id, e.target.value);
                        } catch (err) {
                          alert((err as Error).message);
                        }
                      })
                    }
                    className="h-8 rounded-md border border-border bg-elevated px-2 text-[12px] text-foreground outline-none focus:border-gold/40 disabled:opacity-50"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="py-2.5 pr-4">
                  {u.mfaEnabled ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-green">
                      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                      on
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-amber">
                      <ShieldOff className="h-3.5 w-3.5" strokeWidth={2} />
                      off
                    </span>
                  )}
                </td>

                <td className="py-2.5 pr-4 font-mono text-[11px] text-muted-foreground">
                  {fmt(u.lastLoginAt)}
                </td>

                <td className="py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <IconBtn
                      title="Issue a new temporary password"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const pw = await resetUserPassword(u.id);
                          setNewPw({ id: u.id, pw });
                        })
                      }
                    >
                      <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconBtn>

                    {u.mfaEnabled && (
                      <IconBtn
                        title="Clear MFA — only when they've lost both their phone and their recovery codes"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            if (confirm(`Turn off MFA for ${u.username}? They will need to set it up again.`)) {
                              await clearMfa(u.id);
                            }
                          })
                        }
                      >
                        <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconBtn>
                    )}

                    {suspended ? (
                      <IconBtn
                        title="Restore access"
                        disabled={pending}
                        onClick={() => startTransition(() => restore(u.id))}
                        tone="good"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconBtn>
                    ) : (
                      <IconBtn
                        // You cannot suspend yourself. The server refuses too — this
                        // just avoids offering a button that always errors.
                        title={isSelf ? "You cannot suspend yourself" : "Suspend — takes effect immediately"}
                        disabled={pending || isSelf}
                        onClick={() =>
                          startTransition(async () => {
                            if (confirm(`Suspend ${u.username}? They are locked out on their next request.`)) {
                              try {
                                await suspend(u.id);
                              } catch (err) {
                                alert((err as Error).message);
                              }
                            }
                          })
                        }
                        tone="bad"
                      >
                        <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconBtn>
                    )}
                  </div>

                  {newPw?.id === u.id && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <code className="rounded border border-green/30 bg-green/[0.06] px-2 py-1 font-mono text-[12px] text-foreground">
                        {newPw.pw}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(newPw.pw);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1600);
                        }}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        title="Copy — this is shown once"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green" strokeWidth={2} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
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

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
        "hover:border-[rgba(255,255,255,0.2)] hover:bg-elevated hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40",
        tone === "bad" && "hover:border-red/40 hover:text-red",
        tone === "good" && "hover:border-green/40 hover:text-green",
      )}
    >
      {children}
    </button>
  );
}
