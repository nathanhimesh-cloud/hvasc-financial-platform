import { cn } from "@/lib/utils";

/**
 * Pulsing placeholder block. Use to reserve layout while server data loads so
 * pages don't flash empty or jump — see `(app)/loading.tsx`.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-elevated/70", className)}
      aria-hidden
    />
  );
}
