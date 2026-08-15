import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { BrandColor } from "@/lib/types";
import { accentBar, bgDim, textColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  color: BrandColor;
  /** Short label — what the number IS. */
  label: string;
  /** Lucide icon shown in a colour-tinted chip beside the label. */
  icon?: LucideIcon;
  value: React.ReactNode;
  meta?: React.ReactNode;
  /** When true, shows an "EST." badge — the figure is an estimate, not confirmed. */
  estimated?: boolean;
  /** Stagger delay (ms) for the entrance animation. */
  delay?: number;
  /** When set, the whole card becomes a link (or in-page "#anchor" scroll). */
  href?: string;
}

/**
 * The one headline-metric tile, used on every page for consistency.
 *
 * Redesigned (Aug 2026 review) so a glance answers "what is this number?": the
 * icon sits in a colour-tinted chip right next to a bigger, bolder label, the
 * value dominates, and at most one quiet line of context sits beneath. The value
 * uses PROPORTIONAL figures — a display-size number reads tighter than tabular
 * digits, which are reserved for columns that must align (see the tables).
 */
export function KpiCard({ color, label, icon: Icon, value, meta, estimated, delay = 0, href }: KpiCardProps) {
  const inner = (
    <>
      <div className="mb-3.5 flex items-center gap-2.5">
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border transition-transform duration-200 group-hover:scale-105",
              bgDim[color],
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", textColor[color])} strokeWidth={1.9} />
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-foreground/70">
          <span className="truncate">{label}</span>
          {estimated && (
            <span
              className="flex-shrink-0 rounded-[3px] border border-amber/30 bg-amber-dim px-1 py-px text-[8px] font-semibold tracking-[0.08em] text-amber"
              title="Estimated — not a confirmed/loaded figure"
            >
              EST.
            </span>
          )}
        </span>
        {href && (
          <ArrowUpRight
            className="ml-auto h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            strokeWidth={2}
          />
        )}
      </div>

      <div className="font-heading text-[36px] font-bold leading-none tracking-[-0.02em] text-foreground">
        {value}
      </div>

      {meta && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[12px] leading-snug text-muted-foreground">
          {meta}
        </div>
      )}
    </>
  );

  const className = cn(
    "group relative block overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card px-5 pb-4 pt-5 transition-all duration-200",
    "hover:-translate-y-0.5 hover:border-[var(--hairline)] hover:bg-card-hover hover:shadow-lg hover:shadow-black/25",
    "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out",
    "before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:content-['']",
    href && "cursor-pointer",
    accentBar[color],
  );

  if (href) {
    // In-page section links (e.g. "#revenue-composition") scroll to a panel on the
    // same dashboard — a plain anchor gives native smooth scroll. Real routes use Link.
    if (href.startsWith("#")) {
      return (
        <a href={href} style={{ animationDelay: `${delay}ms` }} className={className}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} style={{ animationDelay: `${delay}ms` }} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <div style={{ animationDelay: `${delay}ms` }} className={className}>
      {inner}
    </div>
  );
}
