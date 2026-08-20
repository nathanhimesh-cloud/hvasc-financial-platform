"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One pager for every table (Aug 2026 review: "don't make it endless — page it,
 * with numbers and arrows, and keep it sticky"). Two pieces:
 *
 *   usePagination(items, …) — slices a list to the current page, with a
 *     selectable page size and auto-reset when a filter changes.
 *   <TablePager …>         — the sticky control bar: a rows-per-page selector and
 *     "x–y of z" on the left, numbered pages (1 2 3 … with prev/next/edge arrows)
 *     on the right. Put it directly above the <table>; it sticks to the top of the
 *     scroll area so it stays in reach while you read down a long list.
 */

export const PAGE_SIZES = [25, 50, 100, 250];

/**
 * Header-cell styling shared by every table: a solid background so the column row
 * reads as a distinct header on all tables alike.
 *
 * NOTE: this used to also make the <thead> `position: sticky`, but the tables live
 * inside an `overflow-x-auto` wrapper (needed so wide tables scroll sideways without
 * the page body scrolling). A sticky element inside a scroll container sticks to
 * THAT container, not the viewport — so the header floated into the middle of the
 * list. Sticky column headers + horizontal scroll need a fixed-height scroll box
 * (see the follow-up); for now the pager stays sticky and the header is solid.
 */
export const STICKY_HEAD = "bg-elevated";

export function usePagination<T>(
  items: T[],
  opts?: { size?: number; resetKey?: unknown },
) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(opts?.size ?? 50);

  // Back to page 1 whenever the page size or an upstream filter changes, so you're
  // never stranded on an empty page after the list shrinks.
  useEffect(() => {
    setPage(0);
  }, [pageSize, opts?.resetKey]);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return { page: safePage, pageSize, setPage, setPageSize, total, pages, pageItems };
}

/** Page indices to render, with ellipses for long ranges. */
function windowed(current: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const out: (number | "gap")[] = [0];
  const from = Math.max(1, current - 1);
  const to = Math.min(pages - 2, current + 1);
  if (from > 1) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 2) out.push("gap");
  out.push(pages - 1);
  return out;
}

export function TablePager({
  total,
  page,
  pageSize,
  pages,
  onPage,
  onPageSize,
  label = "rows",
}: {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  /** Noun for the row count, e.g. "accounts". */
  label?: string;
}) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const nums = windowed(page, pages);

  return (
    <div className="no-print sticky top-16 z-30 flex h-11 items-center justify-between gap-3 overflow-x-auto border-b border-border bg-card px-1">
      {/* Left: rows-per-page + range */}
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <span className="uppercase tracking-[0.06em]">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-foreground outline-none transition-colors focus:border-gold/40"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums">
          {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {label}
        </span>
      </div>

      {/* Right: page numbers + arrows */}
      {pages > 1 && (
        <div className="flex items-center gap-0.5">
          <PagerBtn label="First page" disabled={page === 0} onClick={() => onPage(0)}>
            <ChevronsLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </PagerBtn>
          <PagerBtn label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </PagerBtn>
          {nums.map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} className="px-1 font-mono text-[11px] text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                className={cn(
                  "min-w-[26px] rounded-md px-1.5 py-1 text-center font-mono text-[11px] tabular-nums transition-colors",
                  n === page
                    ? "bg-gold-dim font-bold text-gold-light"
                    : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                )}
              >
                {n + 1}
              </button>
            ),
          )}
          <PagerBtn label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </PagerBtn>
          <PagerBtn label="Last page" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}>
            <ChevronsRight className="h-3.5 w-3.5" strokeWidth={2} />
          </PagerBtn>
        </div>
      )}
    </div>
  );
}

function PagerBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
