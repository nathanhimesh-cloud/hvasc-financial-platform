"use server";

import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { logAudit } from "@/lib/auth/db";
import { getSnapshot } from "@/lib/data";
import { allGrantFigures } from "@/lib/grants";
import { deriveDepartments } from "@/lib/derive";
import { aiConfigured, draftNarrative } from "@/lib/ai/narrative";
import type { Grant } from "@/lib/types";

export interface NarrativeState {
  error: string;
  draft?: string;
  grantId?: string;
}

/**
 * Draft an acquittal narrative (B5, "Premium").
 *
 * The grant is loaded SERVER-SIDE from its id. The client sends an id and nothing
 * else — it never sends the figures. If it did, anyone could POST arbitrary numbers
 * and get the Council's own platform to write a narrative around them.
 */
export async function generateNarrative(
  _prev: NarrativeState,
  form: FormData,
): Promise<NarrativeState> {
  const session = await getSession();
  if (!session || !can(session.role, "grants.edit")) {
    return { error: "You don't have permission to draft grant narratives." };
  }
  if (!aiConfigured()) {
    return {
      error:
        "AI drafting is not configured. An administrator needs to set ANTHROPIC_API_KEY in the deployment environment.",
    };
  }

  const grantId = String(form.get("grantId") ?? "");
  const snapshot = await getSnapshot();
  const figures = allGrantFigures(snapshot);
  const f = figures.find((x) => x.entry.id === grantId);
  if (!f) return { error: "That grant is not in the register." };

  // A grant whose codes don't resolve has no measured spend. Drafting a narrative
  // around figures we know to be incomplete would launder a data problem into prose.
  if (f.hasUnresolvedCodes) {
    return {
      error:
        "This grant's register codes don't resolve to the ledger, so its spend isn't measured. Fix the codes before drafting — a narrative built on unknown figures is worse than none.",
      grantId,
    };
  }

  const depts = deriveDepartments(snapshot);
  const dept = depts.find((d) => f.entry.expenditureCodes.length > 0 && d.id) ?? depts[0];

  const grant: Grant = {
    id: f.entry.id,
    name: f.entry.name,
    funder: f.entry.funder,
    departmentId: dept?.id ?? "",
    total: f.totalGrantIncome,
    spent: f.expenseToDate,
    reportDue: { label: f.entry.reportDue || "—", level: "muted" },
    acquittal: { label: f.entry.endDate || "—", level: "muted" },
    // GrantStatus has no "complete" — a grant is on-track, not-started, report-due
    // or overdue. Nothing here is ever finished; it is acquitted or it isn't.
    status: f.utilisation <= 0 ? "not-started" : "on-track",
    statusChip: { label: "", level: "muted" },
  };

  try {
    const draft = await draftNarrative(grant, dept?.name ?? "the Council", snapshot.period.label);
    await logAudit(session, "grant.narrative_drafted", `${f.entry.name} (${grantId})`);
    return { error: "", draft, grantId };
  } catch (err) {
    // Never leak the key or the raw SDK error to a browser.
    console.error("narrative draft failed", err);
    return { error: "The drafting service could not be reached. Try again in a moment.", grantId };
  }
}
