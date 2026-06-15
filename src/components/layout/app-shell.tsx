"use client";

import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PageMetaContext } from "@/lib/nav";
import { Sidebar, type DeptNavItem } from "./sidebar";
import { Topbar } from "./topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  departments: DeptNavItem[];
  deptNames: Record<string, string>;
  grantsBadge: number;
  periodLabel: string;
  metaCtx: PageMetaContext;
  children: React.ReactNode;
}

const STORAGE_KEY = "hvasc.sidebar.collapsed";

export function AppShell({
  departments,
  deptNames,
  grantsBadge,
  periodLabel,
  metaCtx,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the user's preference after mount (avoids hydration mismatch).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <TooltipProvider>
      <Sidebar
        departments={departments}
        grantsBadge={grantsBadge}
        periodLabel={periodLabel}
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div
        className={cn(
          "min-h-screen transition-[margin] duration-200 ease-out",
          collapsed ? "ml-[64px]" : "ml-[248px]",
        )}
      >
        <Topbar deptNames={deptNames} metaCtx={metaCtx} />
        <main className="pb-10">{children}</main>
      </div>
    </TooltipProvider>
  );
}
