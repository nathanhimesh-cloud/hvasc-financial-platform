import {
  Baby,
  Briefcase,
  Building2,
  Droplets,
  Home,
  Landmark,
  Leaf,
  Route,
  Trophy,
  Users,
  Warehouse,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Department icon registry.
 *
 * The data model stores an icon *key* (e.g. "droplets") rather than an emoji,
 * so we render a proper, consistent lucide icon everywhere.
 */
const DEPT_ICONS: Record<string, LucideIcon> = {
  droplets: Droplets,
  route: Route,
  warehouse: Warehouse,
  baby: Baby,
  // Real HVASC functions (Practical "Analysis by function").
  landmark: Landmark, // Governance
  users: Users, // Community Services
  home: Home, // Housing
  trophy: Trophy, // Youth & Recreation
  waves: Waves, // Sewerage
  zap: Zap, // Essential Services
  leaf: Leaf, // Environment Management
  briefcase: Briefcase, // Economic Development
};

export function getDeptIcon(key: string): LucideIcon {
  return DEPT_ICONS[key] ?? Building2;
}

/** Render a department icon by key. */
export function DeptIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = getDeptIcon(name);
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
