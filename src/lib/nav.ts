import {
  LayoutDashboard,
  Landmark,
  LayoutGrid,
  Upload,
  FileText,
  Tags,
  type LucideIcon,
} from "lucide-react";

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
  { href: "/reports", label: "Detailed Reports", icon: FileText },
];

/** "Data" section — tools that change what the reports show. */
export const dataNav: NavLink[] = [
  { href: "/mapping", label: "Account Mapping", icon: Tags },
  { href: "/data", label: "Data Upload", icon: Upload },
];

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
