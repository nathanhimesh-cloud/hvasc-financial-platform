import Image from "next/image";

/**
 * Global footer — the SandS Australia credit line the client asked to appear on
 * every dashboard page (Hazel, 14 Aug review): logo, the "developed & maintained"
 * statement, website and contact.
 *
 * Marked `no-print` so it doesn't collide with the reports' own print footer when
 * a page is exported to PDF.
 */
export function AppFooter() {
  return (
    <footer className="no-print mt-2 border-t border-border px-6 py-5">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="flex h-8 items-center rounded-md bg-white px-2 py-1 shadow-sm">
            <Image
              src="/sands-australia.png"
              alt="SandS Australia"
              width={92}
              height={28}
              className="h-6 w-auto object-contain"
            />
          </span>
          <span className="text-[12px] leading-snug text-muted-foreground">
            Conceptualised, developed &amp; maintained by{" "}
            <span className="font-medium text-foreground">SandS Australia</span>
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
          <a
            href="https://sandsaustralia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            sandsaustralia.com
          </a>
          <span className="text-border">·</span>
          <a href="mailto:info@sandsaustralia.com" className="transition-colors hover:text-foreground">
            info@sandsaustralia.com
          </a>
        </div>
      </div>
    </footer>
  );
}
