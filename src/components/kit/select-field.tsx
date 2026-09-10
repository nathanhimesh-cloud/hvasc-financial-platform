"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one dropdown. A NATIVE `<select>`, deliberately.
 *
 * Eight places in this app render a dropdown, and they had drifted into eight
 * slightly different ones — the period picker on every page, rows-per-page,
 * department pickers on the mapping form, user roles. This is that control,
 * once, so they look the same and stay that way (Sep 2026: "same drop down
 * style used in all the other pages, I need consistency").
 *
 * Native rather than a custom popover, and that is the important part. A
 * `<select>` gets keyboard navigation, type-to-jump, correct behaviour on a
 * phone, `<optgroup>` headings and the platform's own focus ring for free — all
 * of which a div-with-buttons has to reimplement and usually reimplements
 * worse. The one thing it cannot do is multi-step interaction, so a control that
 * genuinely needs that (picking a span by clicking twice) is the exception, not
 * this.
 *
 * Styling lives here and nowhere else. Callers pass an icon and options.
 *
 * DO NOT WRAP THIS IN A <label>. It renders its own, and a label inside a label
 * is invalid HTML — the browser's parser relocates the inner one, the DOM stops
 * matching the tree React rendered, and hydration fails on the whole subtree.
 * The pager did exactly that and took the grants page down with it. Use a
 * <span> for adjacent text; `ariaLabel` already names the field.
 */
export function SelectField({
  value,
  onChange,
  icon: Icon,
  ariaLabel,
  disabled,
  title,
  className,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Optional leading icon, sat inside the field. */
  icon?: LucideIcon;
  ariaLabel: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  /** `<option>` / `<optgroup>` elements. */
  children: React.ReactNode;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{ariaLabel}</span>
      {Icon && (
        <Icon
          className={cn(
            "pointer-events-none absolute left-2.5 h-3.5 w-3.5",
            disabled ? "text-muted-foreground" : "text-gold",
          )}
          strokeWidth={1.75}
        />
      )}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-md border border-border bg-elevated py-0 text-[13px] font-medium text-foreground",
          "outline-none transition-colors hover:border-gold/40 focus:border-gold/40 disabled:cursor-not-allowed disabled:opacity-60",
          Icon ? "pl-8" : "pl-3",
          "pr-8",
          className,
        )}
      >
        {children}
      </select>
      {/* Our own chevron. `appearance-none` removes the platform one so the field
          matches the app's other controls; without replacing it the select reads
          as a plain text box and nobody thinks to click it. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2.5 h-3 w-3 text-muted-foreground"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
