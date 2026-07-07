"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { allDepartmentsNav, dataNav, overviewNav } from "@/lib/nav";
import { getDeptIcon } from "@/lib/icons";
import { PROFILE } from "@/lib/profile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DeptNavItem {
  slug: string;
  name: string;
  icon: string;
}

interface SidebarProps {
  departments: DeptNavItem[];
  grantsBadge: number;
  /** ISO date of the last successful sync (snapshot.meta.generatedAt). */
  lastSync?: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({
  departments,
  grantsBadge,
  lastSync,
  collapsed,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();

  // The Departments list is long, so let it collapse. Persist the choice, and
  // always reveal it while you're on a department route.
  const deptActive = pathname.startsWith("/departments");
  const [deptsOpen, setDeptsOpen] = useState(true);
  useEffect(() => {
    // Restore the saved choice on mount (kept out of the initial state to avoid
    // an SSR/hydration mismatch — the server has no localStorage).
    const saved = localStorage.getItem("hv:deptsOpen");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved != null) setDeptsOpen(saved === "1");
  }, []);
  useEffect(() => {
    localStorage.setItem("hv:deptsOpen", deptsOpen ? "1" : "0");
  }, [deptsOpen]);
  const showDepts = collapsed || deptsOpen || deptActive;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-100 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        collapsed ? "w-[64px]" : "w-[248px]",
      )}
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          "flex h-[57px] items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-foreground font-heading text-[12px] font-bold text-background">
            HV
          </span>
          {!collapsed && (
            <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
              Hope Vale ASC
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mt-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <NavGroup label="Overview" collapsed={collapsed}>
          {overviewNav.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/")
              }
              collapsed={collapsed}
              badge={item.href === "/grants" && grantsBadge > 0 ? grantsBadge : undefined}
            />
          ))}
        </NavGroup>

        <NavGroup label="Data" collapsed={collapsed}>
          {dataNav.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              collapsed={collapsed}
            />
          ))}
        </NavGroup>

        <NavGroup
          label="Departments"
          collapsed={collapsed}
          collapsible
          open={showDepts}
          count={departments.length}
          onToggle={() => setDeptsOpen((v) => !v)}
        >
          <NavRow
            href={allDepartmentsNav.href}
            label={allDepartmentsNav.label}
            icon={allDepartmentsNav.icon}
            active={pathname === allDepartmentsNav.href}
            collapsed={collapsed}
          />
          {departments.map((d) => (
            <NavRow
              key={d.slug}
              href={`/departments/${d.slug}`}
              label={d.name}
              icon={getDeptIcon(d.icon)}
              active={pathname === `/departments/${d.slug}`}
              collapsed={collapsed}
            />
          ))}
        </NavGroup>
      </nav>

      {/* Data sync status (replaces the old Reporting Period block — brief B10) */}
      {!collapsed && <SyncStatus lastSync={lastSync} />}

      {/* Help + Profile */}
      <div className="border-t border-sidebar-border p-2.5">
        <HelpLink collapsed={collapsed} />
        <ProfileMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

// 6:00am · 12:30pm · 6:00pm AEST (Queensland has no daylight saving), in minutes.
const SYNC_SLOTS = [6 * 60, 12 * 60 + 30, 18 * 60];

function SyncStatus({ lastSync }: { lastSync?: string }) {
  const [nextLabel, setNextLabel] = useState("");
  useEffect(() => {
    // AEST = UTC+10 year-round. Shift so the UTC fields read AEST wall-clock time.
    const aest = new Date(Date.now() + 10 * 3600 * 1000);
    const cur = aest.getUTCHours() * 60 + aest.getUTCMinutes();
    let slot = SYNC_SLOTS.find((s) => s > cur);
    const day = slot === undefined ? "tomorrow" : "today";
    if (slot === undefined) slot = SYNC_SLOTS[0];
    const h = Math.floor(slot / 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const ap = h < 12 ? "am" : "pm";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextLabel(`${h12}:${(slot % 60).toString().padStart(2, "0")}${ap} ${day}`);
  }, []);

  return (
    <div className="px-4 pb-3">
      <div className="rounded-md border border-sidebar-border bg-card px-3 py-2.5">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          Data Sync
        </div>
        <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green [animation:pulse-dot_2s_infinite]" />
          {lastSync ? `Last: ${formatSyncDate(lastSync)}` : "Awaiting first sync"}
        </div>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          {nextLabel ? `Next ~${nextLabel} · AEST` : "6am · 12:30pm · 6pm AEST"}
        </div>
      </div>
    </div>
  );
}

function formatSyncDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function HelpLink({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === "/support";

  const link = (
    <Link
      href="/support"
      aria-label="Help Centre"
      className={cn(
        "mb-1 flex w-full items-center rounded-md outline-none transition-colors",
        active ? "bg-elevated text-foreground" : "text-muted-foreground hover:bg-card-hover hover:text-foreground",
        collapsed ? "justify-center p-1.5" : "gap-2.5 px-2 py-2",
      )}
    >
      <LifeBuoy className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="text-[13px] font-medium">Help Centre</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">Help Centre</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({
  label,
  collapsed,
  children,
  collapsible = false,
  open = true,
  count,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
  /** Render the header as a toggle that shows/hides the items. */
  collapsible?: boolean;
  open?: boolean;
  /** Optional item count shown next to the label. */
  count?: number;
  onToggle?: () => void;
}) {
  return (
    <div className="mb-4">
      {!collapsed &&
        (collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="group mb-1.5 flex w-full items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")}
              strokeWidth={2}
            />
            <span>{label}</span>
            {count !== undefined && (
              <span className="ml-auto rounded-full bg-elevated px-1.5 text-[9px] tabular-nums text-muted-foreground">
                {count}
              </span>
            )}
          </button>
        ) : (
          <div className="mb-1.5 px-2 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
        ))}
      {(open || collapsed) && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

function NavRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const row = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center rounded-md text-[13px] font-medium transition-colors",
        collapsed ? "h-9 w-9 justify-center" : "h-9 gap-2.5 px-2.5",
        active
          ? "bg-elevated text-foreground"
          : "text-muted-foreground hover:bg-card-hover hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gold" />
      )}
      <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="rounded-full bg-red-dim px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red">
          {badge}
        </span>
      )}
      {collapsed && badge !== undefined && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red" />
      )}
    </Link>
  );

  if (!collapsed) return row;
  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === "/account";

  const link = (
    <Link
      href="/account"
      aria-label="Account"
      className={cn(
        "flex w-full items-center rounded-md outline-none transition-colors",
        active ? "bg-elevated" : "hover:bg-card-hover",
        collapsed ? "justify-center p-1.5" : "gap-2.5 px-2 py-2",
      )}
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-[11px] font-semibold text-foreground">
        {PROFILE.initials}
      </span>
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-[13px] font-medium text-foreground">
              {PROFILE.name}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {PROFILE.role}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </>
      )}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">Account</TooltipContent>
    </Tooltip>
  );
}
