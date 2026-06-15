import { Content, Panel } from "@/components/kit/panel";
import { Skeleton } from "@/components/kit/skeleton";

/**
 * Route-transition fallback. Mirrors the common dashboard shape (KPI row + a
 * couple of panels) so navigating between pages shows structured placeholders
 * instead of a blank screen or layout shift.
 */
export default function Loading() {
  return (
    <Content>
      <span className="sr-only">Loading…</span>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} className="hover:border-border">
            <Skeleton className="mb-3 h-3 w-24" />
            <Skeleton className="mb-2 h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </Panel>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2 hover:border-border">
          <Skeleton className="mb-5 h-4 w-40" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="hover:border-border">
          <Skeleton className="mb-5 h-4 w-28" />
          <Skeleton className="h-40 w-full" />
        </Panel>
      </div>
    </Content>
  );
}
