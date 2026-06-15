import type { AlertLevel, BrandColor, DepartmentStatus } from "@/lib/types";
import { alertChip, bgColor, statusLabel, statusToColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** Small glowing status dot (red/amber/green). */
export function RagDot({ color }: { color: BrandColor }) {
  return (
    <span
      className={cn("h-2 w-2 flex-shrink-0 rounded-full", bgColor[color])}
      style={{ boxShadow: `0 0 6px var(--color-${color})` }}
    />
  );
}

const statusPillTone: Record<DepartmentStatus, string> = {
  "on-track": "bg-green-dim text-green border-[rgba(80,216,144,0.25)]",
  "at-risk": "bg-amber-dim text-amber border-[rgba(245,168,48,0.25)]",
  "over-budget": "bg-red-dim text-red border-[rgba(255,96,96,0.25)]",
};

/** Department status pill with a RAG dot. */
export function StatusPill({ status }: { status: DepartmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full border px-[11px] py-1 text-[11px] font-bold",
        statusPillTone[status],
      )}
    >
      <RagDot color={statusToColor[status]} />
      {statusLabel[status]}
    </span>
  );
}

/** Grant report/acquittal/status chip. */
export function AlertChip({
  level,
  children,
}: {
  level: AlertLevel;
  children: React.ReactNode;
}) {
  if (level === "muted") {
    return (
      <span className="font-mono text-[11px] font-medium text-subtle">
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] font-mono text-[10px] font-bold",
        alertChip[level],
      )}
    >
      {children}
    </span>
  );
}

export type DeltaTone = "positive" | "negative" | "neutral";

/** Pill-shaped delta indicator used on KPI cards. */
export function Delta({
  tone,
  children,
}: {
  tone: DeltaTone;
  children: React.ReactNode;
}) {
  const tones: Record<DeltaTone, string> = {
    positive: "bg-green-dim text-green",
    negative: "bg-red-dim text-red",
    neutral: "bg-amber-dim text-amber",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
