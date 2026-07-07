import { Clock, CalendarRange } from "lucide-react";

/**
 * Provenance stamp (Build Brief A1): every report must carry a visible
 * "Data as at <timestamp> • Period: <from–to>" so the period a user is looking
 * at is never ambiguous (the v1 defect was three statements silently on two
 * different years under one period label).
 */
export function DataStamp({
  generatedAt,
  periodLabel,
  fyLabel,
  source,
}: {
  /** ISO date the snapshot was generated, e.g. "2026-06-12". */
  generatedAt?: string;
  /** The active reporting period, e.g. "YTD to May" or "May 2026". */
  periodLabel: string;
  fyLabel: string;
  /** Optional data origin, e.g. "Civica Practical exports". */
  source?: string;
}) {
  const asAt = generatedAt ? formatAsAt(generatedAt) : "—";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3 w-3" strokeWidth={1.75} />
        Data as at {asAt}
      </span>
      <span className="text-border">•</span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarRange className="h-3 w-3" strokeWidth={1.75} />
        {fyLabel} · {periodLabel}
      </span>
      {source && (
        <>
          <span className="text-border">•</span>
          <span className="normal-case tracking-normal">{source}</span>
        </>
      )}
    </div>
  );
}

/** Format an ISO date as a stable, locale-independent "12 Jun 2026". */
function formatAsAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
