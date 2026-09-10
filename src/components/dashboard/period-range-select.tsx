"use client";

import { CalendarRange, History } from "lucide-react";
import { SelectField } from "@/components/kit/select-field";
import type { MonthSelection } from "@/lib/period-range";

/**
 * The dashboard's period picker: the SAME native select every other page uses
 * (see kit/select-field.tsx), grouped by financial year.
 *
 * WHAT CHANGED AND WHY. This was a custom popover you clicked twice to pick a
 * span — Apr through Jun, say. It worked, and it was the only control on the site
 * that looked and behaved unlike the rest, which is a poor trade for a span
 * nobody had asked to pick since. A native `<select>` holds one value, so each
 * option IS a period: a whole financial year, or one month of it.
 *
 * If arbitrary spans are wanted back, they need a second field (from / to) rather
 * than a bespoke popover — the consistency is worth more than the shortcut.
 */
export interface MonthGroup {
  fy: "current" | "prior";
  label: string;
  /** Oldest first; listed newest first. */
  months: { idx: number; month: string }[];
}

/** `fy:all` for a whole year, `fy:idx` for one month. */
function encode(fy: "current" | "prior", month: number | "all") {
  return `${fy}:${month}`;
}

export function PeriodRangeSelect({
  groups,
  fy,
  selectedMonths,
  onChange,
  enabled,
  disabledHint,
  isLatest,
}: {
  groups: MonthGroup[];
  fy: "current" | "prior";
  selectedMonths: MonthSelection;
  onChange: (next: { fy: "current" | "prior"; months: MonthSelection }) => void;
  enabled: boolean;
  disabledHint?: string;
  isLatest: boolean;
}) {
  const active = groups.find((g) => g.fy === fy) ?? groups[0];
  const wholeYear = !!active && selectedMonths.length === active.months.length;
  // One month selected → that option; anything else → the year. A span left over
  // from the old control has no option of its own, so it shows as the year rather
  // than leaving the field blank.
  const value =
    wholeYear || selectedMonths.length !== 1
      ? encode(fy, "all")
      : encode(fy, selectedMonths[0]);

  const handle = (raw: string) => {
    const [nextFy, part] = raw.split(":") as ["current" | "prior", string];
    const g = groups.find((x) => x.fy === nextFy);
    if (!g) return;
    onChange({
      fy: nextFy,
      months: part === "all" ? g.months.map((m) => m.idx) : [Number(part)],
    });
  };

  /** "Aug" + FY month index → the calendar year. Jul–Dec open the FY; Jan–Jun roll over. */
  const yearOf = (g: MonthGroup, idx: number) => {
    const start = Number(g.label.replace(/^FY/i, "").split("-")[0]);
    return Number.isFinite(start) ? String(idx <= 6 ? start : start + 1) : "";
  };

  return (
    <div className="no-print inline-flex items-center gap-2">
      <SelectField
        ariaLabel="Reporting period"
        icon={CalendarRange}
        value={value}
        onChange={handle}
        disabled={!enabled}
        title={enabled ? undefined : disabledHint}
      >
        {groups.map((g) => (
          <optgroup key={g.fy} label={g.label}>
            <option value={encode(g.fy, "all")}>{g.label} · all months</option>
            {[...g.months].reverse().map((m) => (
              <option key={`${g.fy}-${m.idx}`} value={encode(g.fy, m.idx)}>
                {m.month} {yearOf(g, m.idx)}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      {!isLatest && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-amber">
          <History className="h-3 w-3" strokeWidth={2} />
          Archived
        </span>
      )}
    </div>
  );
}
