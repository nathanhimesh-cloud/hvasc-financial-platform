import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Grant } from "@/lib/types";

/**
 * AI grant narratives (Build Brief B5, "Premium").
 *
 * WHAT THIS IS: an acquittal narrative — the paragraph a grant manager writes at
 * report time, describing what the money did. It is drafted from figures we have
 * already reconciled to the general ledger.
 *
 * WHAT THIS IS NOT: a source of numbers. Every figure in the prompt is computed in
 * `grantFacts()` below, from the snapshot, in ordinary TypeScript — and every figure
 * is handed to the model pre-formatted. The model is told, in the system prompt, that
 * it may not compute, adjust, or invent a number. A language model that does
 * arithmetic in a Council's acquittal is a liability, not a feature.
 *
 * The output is a DRAFT. It is labelled as one everywhere it appears, and nothing
 * writes it back to Practical.
 */

/** Is the integration configured? Never returns the key itself. */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

/**
 * The key is read from the environment at call time and never leaves this module.
 *
 * It is deliberately NOT stored in Postgres and NOT settable from the UI. A key
 * typed into a web form lands in the database, in every database backup, and in
 * reach of every admin. An environment variable does none of those things.
 */
function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI narratives are not configured.");
  return new Anthropic({ apiKey });
}

const D = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/** Everything the model is allowed to know. Computed here, in code. */
function grantFacts(grant: Grant, deptName: string, period: string) {
  const remaining = grant.total - grant.spent;
  const pct = grant.total > 0 ? (grant.spent / grant.total) * 100 : 0;
  return [
    `Grant: ${grant.name}`,
    `Funding body: ${grant.funder}`,
    `Department: ${deptName}`,
    `Reporting period: ${period}`,
    `Total funding: ${D(grant.total)}`,
    `Spent to date: ${D(grant.spent)}`,
    `Remaining: ${D(remaining)}`,
    `Proportion spent: ${pct.toFixed(1)}%`,
    `Status: ${grant.status}`,
    `Next report due: ${grant.reportDue.label}`,
    `Acquittal due: ${grant.acquittal.label}`,
  ].join("\n");
}

const SYSTEM = `You draft acquittal narratives for Hope Vale Aboriginal Shire Council, a Queensland local government.

You are given figures that have ALREADY been reconciled to the Council's general ledger.

Rules, in order of importance:
1. NEVER compute, adjust, estimate, or invent a number. Use only the figures given, exactly as written. If a figure you want is not in the facts, write around it — do not derive it.
2. Never state a fact about the project's activities, deliverables, or outcomes. You do not know them. Describe the FINANCIAL position only.
3. If spending is well behind the funding received, say so plainly. An acquittal that hides underspend is worse than no acquittal.
4. Write plain Australian English for a councillor or a funding body — no jargon, no marketing language, no emoji, no headings.
5. Two short paragraphs at most. Every sentence must earn its place.

You are writing a DRAFT for a grant manager to check, edit, and sign. Write it as prose they could send, not as a template with blanks.`;

/**
 * Draft the narrative. Streams, so a long draft can't hit a request timeout, and
 * returns the assembled text.
 */
export async function draftNarrative(
  grant: Grant,
  deptName: string,
  period: string,
): Promise<string> {
  const stream = client().messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `Draft the acquittal narrative for this grant.\n\n<facts>\n${grantFacts(grant, deptName, period)}\n</facts>`,
      },
    ],
  });

  const message = await stream.finalMessage();
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}
