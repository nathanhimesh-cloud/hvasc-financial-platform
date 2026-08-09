import type { LucideIcon } from "lucide-react";
import type { BrandColor } from "@/lib/types";
import { accentBar, textColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  color: BrandColor;
  /** Short uppercase label. */
  label: string;
  /** Lucide icon shown in a chip in the top-right. */
  icon?: LucideIcon;
  value: React.ReactNode;
  meta?: React.ReactNode;
  /** When true, shows an "EST." badge — the figure is an estimate, not confirmed. */
  estimated?: boolean;
  /** Stagger delay (ms) for the entrance animation. */
  delay?: number;
}

/** Headline metric card with a coloured top accent bar and an icon chip. */
export function KpiCard({ color, label, icon: Icon, value, meta, estimated, delay = 0 }: KpiCardProps) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card px-5 pb-4 pt-5 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-[var(--hairline)] hover:bg-card-hover hover:shadow-lg hover:shadow-black/25",
        "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out",
        "before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:content-['']",
        accentBar[color],
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {label}
          {estimated && (
            <span
              className="rounded-[3px] border border-amber/30 bg-amber-dim px-1 py-px text-[8px] font-semibold tracking-[0.08em] text-amber"
              title="Estimated — not a confirmed/loaded figure"
            >
              EST.
            </span>
          )}
        </span>
        {Icon && (
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border bg-elevated transition-transform duration-200 group-hover:scale-110">
            <Icon className={cn("h-[15px] w-[15px]", textColor[color])} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="mb-2 font-heading text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {value}
      </div>
      {meta && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {meta}
        </div>
      )}
    </div>
  );
}
