import {
  LayoutDashboard,
  Landmark,
  LayoutGrid,
  FileText,
  FileBarChart,
  Tags,
  ShieldCheck,
  Briefcase,
  Activity,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { can } from "@/lib/auth/roles";

/** Navigation + per-route page header configuration. */

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** "Overview" section — the reporting views. */
export const overviewNav: NavLink[] = [
  { href: "/", label: "CFO Dashboard", icon: LayoutDashboard },
  { href: "/grants", label: "Grant Tracker", icon: Landmark },
  { href: "/jobs", label: "Job Budgets", icon: Briefcase },
  { href: "/reports", label: "Detailed Reports", icon: FileText },
  { href: "/monthly-report", label: "Monthly Report", icon: FileBarChart },
  { href: "/ratios", label: "Sustainability Ratios", icon: Gauge },
];

/**
 * "Data" section — tools that change what the reports show.
 * Data Upload is intentionally removed (brief B10): data now comes via the
 * automated Practical sync, not manual file uploads. The /data route still
 * exists but is unlinked.
 */
export const dataNav: NavLink[] = [
  { href: "/status", label: "Data Status", icon: Activity },
  { href: "/mapping", label: "Account Mapping", icon: Tags },
];

/**
 * The "Data" links this role may see. Read-only roles (CEO, department heads)
 * get none — the pages are gated server-side too, this just avoids showing a
 * link that would 404. Admins additionally get the audit log.
 */
export function dataNavFor(role: string | undefined): NavLink[] {
  // Data provenance is visible to everyone: any reader should be able to check
  // whether the figures in front of them are current, and where they came from.
  const links: NavLink[] = [{ href: "/status", label: "Data Status", icon: Activity }];
  if (can(role, "mapping.edit")) links.push({ href: "/mapping", label: "Account Mapping", icon: Tags });
  if (can(role, "audit.view")) links.push({ href: "/audit", label: "Audit Log", icon: ShieldCheck });
  return links;
}

/** First item in the Departments section — the manager grid. */
export const allDepartmentsNav: NavLink = {
  href: "/departments",
  label: "All Departments",
  icon: LayoutGrid,
};

export interface PageMeta {
  title: string;
  subtitle: string;
}

/** Live context so topbar subtitles reflect the real snapshot, not static text. */
export interface PageMetaContext {
  fyLabel: string;
  periodLabel: string;
  monthOfYear: number;
  monthsInYear: number;
  deptCount: number;
  grantCount: number;
  grantsNeedingAction: number;
  /** True for real uploaded data, false on seed/demo. */
  live: boolean;
  /** Budget columns are estimates (FY26 budget not loaded in Practical). */
  budgetEstimated: boolean;
  /** What comparator figures represent: "Budget" or "FY25". */
  comparisonLabel: string;
  /** ISO date the snapshot was generated, for the "updated" indicator. */
  updatedAt?: string;
}

/**
 * Resolve the topbar title/subtitle for a pathname.
 * `deptNames` maps a department slug → display name for drill-down routes.
 * `ctx` supplies live figures (period, counts) so subtitles stay accurate.
 */
export function getPageMeta(
  pathname: string,
  deptNames: Record<string, string> = {},
  ctx?: PageMetaContext,
): PageMeta {
  const fy = ctx?.fyLabel ?? "FY2025–26";
  if (pathname === "/") {
    return {
      title: "CFO Dashboard",
      subtitle: `${fy} · ${ctx?.periodLabel ?? "May 2026"}`,
    };
  }
  if (pathname === "/grants") {
    const action =
      ctx && ctx.grantsNeedingAction > 0 ? ` · ${ctx.grantsNeedingAction} need action` : "";
    return {
      title: "Grant Tracker",
      subtitle: `${ctx?.grantCount ?? 0} grants${action}`,
    };
  }
  if (pathname === "/status") {
    return { title: "Data Status", subtitle: "Provenance & sync history" };
  }
  if (pathname === "/ratios") {
    return { title: "Financial Sustainability Ratios", subtitle: "Tier 8 statutory measures" };
  }
  if (pathname === "/monthly-report") {
    return { title: "Monthly Management Report", subtitle: "Consolidated & departmental packs" };
  }
  if (pathname === "/jobs") {
    return { title: "Job Budgets", subtitle: "Budget vs actual by job" };
  }
  if (pathname === "/departments") {
    return { title: "Manager View", subtitle: `${ctx?.deptCount ?? "All"} departments` };
  }
  if (pathname === "/reports") {
    return { title: "Detailed Reports", subtitle: "Financial statements" };
  }
  if (pathname === "/mapping") {
    return { title: "Account Mapping", subtitle: "Accounts & grants" };
  }
  if (pathname === "/data") {
    return { title: "Data Upload", subtitle: "Practical exports" };
  }
  if (pathname === "/account") {
    return { title: "Account", subtitle: "Profile · Preferences · Data Access" };
  }
  if (pathname === "/support") {
    return { title: "Help Centre", subtitle: "Guides · FAQ · Contact" };
  }
  const deptMatch = pathname.match(/^\/departments\/([^/]+)$/);
  if (deptMatch) {
    const slug = deptMatch[1];
    return { title: deptNames[slug] ?? "Department", subtitle: "Cost & revenue centre" };
  }
  return { title: "Hope Vale ASC", subtitle: "Financial Intelligence Platform" };
}
