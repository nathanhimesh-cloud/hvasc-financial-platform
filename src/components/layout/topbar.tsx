"use client";

import { usePathname } from "next/navigation";
import { getPageMeta, type PageMetaContext } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface TopbarProps {
  /** slug → display name, for drill-down route titles. */
  deptNames: Record<string, string>;
  /** Live snapshot context for accurate subtitles. */
  metaCtx: PageMetaContext;
}

/** "2026-06-14" → "14 Jun 2026" (falls back to the raw value). */
function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

export function Topbar({ deptNames, metaCtx }: TopbarProps) {
  const pathname = usePathname();
  const { title, subtitle } = getPageMeta(pathname, deptNames, metaCtx);

  const basis = metaCtx.comparisonLabel === "FY25" ? "FY25 actuals" : "FY26 budget";
  const updated = formatDate(metaCtx.updatedAt);

  return (
    <header className="sticky top-0 z-50 flex h-[64px] items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-xl">
      <div className="min-w-0">
        <h1 className="truncate font-heading text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        <p className="truncate font-mono text-[12px] leading-tight text-muted-foreground">
          {subtitle}
        </p>
      </div>

      {/* Compact status — details on hover */}
      <span
        title={`${metaCtx.live ? "Live data" : "Demo data"}${updated ? ` · updated ${updated}` : ""} · Basis: ${basis}`}
        className="ml-auto hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground md:inline-flex"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            metaCtx.live ? "bg-green [animation:pulse-dot_2s_infinite]" : "bg-muted-foreground",
          )}
        />
        {metaCtx.live ? "Live" : "Demo"}
      </span>
    </header>
  );
}
