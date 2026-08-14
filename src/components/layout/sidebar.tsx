"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { allDepartmentsNav, overviewNav, trackingNav, reportsNav } from "@/lib/nav";
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
  /** Logged-in user (null when auth isn't configured). */
  user?: { username: string; role: string } | null;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({
  departments,
  grantsBadge,
  user,
  collapsed,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();

  // The Departments list is long, so let it collapse. Persist the choice, and
  // always reveal it while you're on a department route.
  // Collapsed by DEFAULT. Four department links expanded on every screen is four
  // links most people never click, pushing everything else down. It opens on its
  // own when you're actually in a department, and the choice is remembered.
  const deptActive = pathname.startsWith("/departments");
  const [deptsOpen, setDeptsOpen] = useState(false);
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
          "flex h-[64px] items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white shadow-sm">
            <Image
              src="/hvasc-logo.jpg"
              alt="Hope Vale Aboriginal Shire Council"
              width={32}
              height={32}
              className="h-full w-full object-contain"
              priority
            />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                Hope Vale ASC
              </span>
              <span className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Financial Intelligence
              </span>
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
              active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}
        </NavGroup>

        {/* Things with a lifecycle you're following through to a conclusion. */}
        <NavGroup label="Tracking" collapsed={collapsed}>
          {trackingNav.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              collapsed={collapsed}
              badge={item.href === "/grants" && grantsBadge > 0 ? grantsBadge : undefined}
            />
          ))}
        </NavGroup>

        {/* Formal statements — the things you'd print, sign, or send to Council. */}
        <NavGroup label="Reports" collapsed={collapsed}>
          {reportsNav.map((item) => (
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

      {/*
        The sidebar's job is navigation. It used to also carry a sync-status card
        and a sign-out link — two things you look at rarely and act on rarely,
        occupying permanent space on every screen.

        Both now live where they belong: sync status on /status (linked from
        Settings and the Data Status page), sign-out inside the profile menu, one
        click away. The profile menu is where every application on earth puts it.
      */}
      <div className="border-t border-sidebar-border p-2.5">
        <HelpLink collapsed={collapsed} />
        <ProfileMenu collapsed={collapsed} user={user} />
      </div>
    </aside>
  );
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

function ProfileMenu({ collapsed, user }: { collapsed: boolean; user?: { username: string; role: string } | null }) {
  const pathname = usePathname();
  const active = pathname === "/account";
  const name = user?.username ?? PROFILE.name;
  const role = user?.role ?? PROFILE.role;
  const initials = (user?.username ?? PROFILE.initials).slice(0, 2).toUpperCase();

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
        {initials}
      </span>
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-[13px] font-medium text-foreground">
              {name}
            </span>
            <span className="truncate text-[11px] capitalize text-muted-foreground">
              {role}
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
