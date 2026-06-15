import { cn } from "@/lib/utils";

/** Page content wrapper with the standard padding. */
export function Content({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-6 pb-10 pt-6", className)}>{children}</div>;
}

/** Bordered surface card. */
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-card p-5 transition-colors hover:border-[rgba(255,255,255,0.16)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card header: title + optional subtitle on the left, optional node on the right. */
export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <div className="text-[14px] font-semibold tracking-tight text-foreground">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

/** Small pill badge. */
export function CardBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-elevated px-2 py-1 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Section divider label — a small uppercase heading used to group the major
 * blocks of a page (e.g. "Financial Position", "Budget Performance"). Gives a
 * long page a scannable rhythm without competing with panel headers.
 */
export function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </h2>
      {hint && <span className="font-mono text-[10px] text-subtle">{hint}</span>}
    </div>
  );
}

/**
 * Page intro line — a one-line description (and optional actions) under the
 * topbar title. The topbar already owns the page title, so this deliberately
 * has no heading, keeping every page's top consistent.
 */
export function PageIntro({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{children}</p>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Highlighted info banner. */
export function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
