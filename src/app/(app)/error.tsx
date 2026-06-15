"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error in the console for diagnosis.
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-elevated">
        <AlertTriangle className="h-5 w-5 text-red" strokeWidth={1.75} />
      </span>
      <h2 className="mb-1 text-lg font-semibold text-foreground">
        Something went wrong on this page
      </h2>
      <p className="mb-2 max-w-md text-[13px] text-muted-foreground">
        {error.message || "An unexpected error occurred while rendering."}
      </p>
      {error.digest && (
        <p className="mb-5 font-mono text-[11px] text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <RotateCw className="h-4 w-4" strokeWidth={1.75} />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-elevated"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
