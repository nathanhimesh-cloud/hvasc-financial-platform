import type { GrantFigures } from "@/lib/grants";

/**
 * Grant deadline alerts (Build Brief B5).
 *
 * The brief asks for EMAIL alerts. This is the in-app half, and it is deliberately
 * shipped first — because an email alert is only as good as the thing that decides
 * when to send it, and that decision is what lives here. Wiring a mail service to a
 * bad rule just delivers the wrong alert faster.
 *
 * (Email needs a provider account the Council doesn't have yet. When it exists, this
 * function is what the scheduled job will call — no new logic, just a transport.)
 *
 * What makes an alert worth sending: a deadline that is CLOSE and funding that is
 * NOT ACQUITTED. A report due next week on a grant that's fully spent is a form to
 * fill in. A report due next week on a grant that's barely started is a problem.
 */

export type Urgency = "overdue" | "urgent" | "soon";

export interface Deadline {
  id: string;
  name: string;
  funder: string;
  /** What is due — a progress report, or the final acquittal. */
  kind: "report" | "acquittal";
  dueDate: string;
  daysLeft: number;
  urgency: Urgency;
  /** Cash received and not yet spent when this falls due. */
  unspent: number;
  note: string;
}

const DAY = 86_400_000;

/** Alert windows, in days. */
const URGENT = 30;
const SOON = 90;

function parse(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export interface DeadlineReport {
  deadlines: Deadline[];
  /**
   * TRUE when not one active grant carries a usable date.
   *
   * This distinction is the whole point of the type. Without it, an empty list renders
   * as "nothing due in the next 90 days" — which is a confident lie when what we
   * actually mean is "the register has no dates in it, so we cannot tell you."
   *
   * Hope Vale's register is exactly this case today: endDate is empty on all 89 rows,
   * startDate on all 89, and reportDue on 88 of 89. An "all clear" drawn from that is
   * worse than no panel at all, because it tells a CEO someone is watching when nobody is.
   */
  noDates: boolean;
  /** How many active grants carry no date at all — the size of the blind spot. */
  undatedCount: number;
}

export function grantDeadlines(figures: GrantFigures[], now = Date.now()): DeadlineReport {
  const out: Deadline[] = [];
  const active = figures.filter((f) => f.entry.active);
  let dated = 0;

  for (const f of active) {
    const e = f.entry;
    if (parse(e.reportDue) !== null || parse(e.endDate) !== null) dated++;

    const unspent = Math.max(0, f.incomeToDate - f.expenseToDate);

    const candidates: { kind: Deadline["kind"]; iso: string }[] = [
      { kind: "report", iso: e.reportDue },
      { kind: "acquittal", iso: e.endDate },
    ];

    for (const c of candidates) {
      const t = parse(c.iso);
      if (t === null) continue;

      const daysLeft = Math.round((t - now) / DAY);
      if (daysLeft > SOON) continue; // too far out to be an alert

      const urgency: Urgency =
        daysLeft < 0 ? "overdue" : daysLeft <= URGENT ? "urgent" : "soon";

      /*
        A deadline on a FULLY ACQUITTED grant is paperwork, not risk. Reporting it at
        the same volume as an unspent one is how an alert list becomes wallpaper — and
        an alert list nobody reads is worse than no alert list, because it creates the
        belief that someone is watching.
      */
      if (urgency === "soon" && unspent < 1000) continue;

      const note =
        unspent < 1000
          ? "Funding is fully acquitted — this is a form to complete, not money at risk."
          : daysLeft < 0
            ? `${Math.abs(daysLeft)} days overdue with funding still unspent.`
            : `Funding still unspent with ${daysLeft} days to go.`;

      out.push({
        id: `${e.id}:${c.kind}`,
        name: e.name,
        funder: e.funder,
        kind: c.kind,
        dueDate: c.iso,
        daysLeft,
        urgency,
        unspent,
        note,
      });
    }
  }

  return {
    // Soonest first — an overdue item outranks everything.
    deadlines: out.sort((a, b) => a.daysLeft - b.daysLeft),
    noDates: active.length > 0 && dated === 0,
    undatedCount: active.length - dated,
  };
}
