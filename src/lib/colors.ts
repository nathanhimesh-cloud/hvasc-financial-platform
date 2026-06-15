import type { AlertLevel, BrandColor, DepartmentStatus } from "@/lib/types";

/**
 * Static class maps for brand colours.
 *
 * Tailwind only generates classes it can see as literal strings, so we cannot
 * build `text-${color}` dynamically — these lookup tables keep every class
 * present in the source.
 */

export const textColor: Record<BrandColor, string> = {
  teal: "text-teal",
  blue: "text-blue",
  indigo: "text-indigo",
  violet: "text-violet",
  amber: "text-amber",
  red: "text-red",
  green: "text-green",
  gold: "text-gold",
};

export const bgColor: Record<BrandColor, string> = {
  teal: "bg-teal",
  blue: "bg-blue",
  indigo: "bg-indigo",
  violet: "bg-violet",
  amber: "bg-amber",
  red: "bg-red",
  green: "bg-green",
  gold: "bg-gold",
};

export const bgDim: Record<BrandColor, string> = {
  teal: "bg-teal-dim",
  blue: "bg-blue-dim",
  indigo: "bg-indigo-dim",
  violet: "bg-violet-dim",
  amber: "bg-amber-dim",
  red: "bg-red-dim",
  green: "bg-green-dim",
  gold: "bg-gold-dim",
};

/** Top-border accent gradient for KPI cards. */
export const accentBar: Record<BrandColor, string> = {
  teal: "before:bg-gradient-to-r before:from-teal before:to-transparent",
  blue: "before:bg-gradient-to-r before:from-blue before:to-transparent",
  indigo: "before:bg-gradient-to-r before:from-indigo before:to-transparent",
  violet: "before:bg-gradient-to-r before:from-violet before:to-transparent",
  amber: "before:bg-gradient-to-r before:from-amber before:to-transparent",
  red: "before:bg-gradient-to-r before:from-red before:to-transparent",
  green: "before:bg-gradient-to-r before:from-green before:to-transparent",
  gold: "before:bg-gradient-to-r before:from-gold-light before:to-transparent",
};

/** Inline style hex for SVG fills / widths where a class won't do. */
export const hex: Record<BrandColor, string> = {
  teal: "#3dd6c8",
  blue: "#6aaeff",
  indigo: "#8593f0",
  violet: "#b58af0",
  amber: "#f5a830",
  red: "#ff6060",
  green: "#50d890",
  gold: "#d4a84c",
};

export const statusToColor: Record<DepartmentStatus, BrandColor> = {
  "on-track": "green",
  "at-risk": "amber",
  "over-budget": "red",
};

export const statusLabel: Record<DepartmentStatus, string> = {
  "on-track": "On Track",
  "at-risk": "At Risk",
  "over-budget": "Over Budget",
};

/** Alert chip classes by urgency level. */
export const alertChip: Record<AlertLevel, string> = {
  urgent: "bg-red-dim text-red border border-[rgba(255,96,96,0.25)]",
  warning: "bg-amber-dim text-amber border border-[rgba(245,168,48,0.25)]",
  ok: "bg-green-dim text-green border border-[rgba(80,216,144,0.25)]",
  muted: "text-subtle",
};
