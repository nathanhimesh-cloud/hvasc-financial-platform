"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Sun, Moon } from "lucide-react";
import { THEMES, THEME_STORAGE_KEY, DEFAULT_THEME, applyTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemeId, typeof Monitor> = {
  vantage: Monitor,
  "pbi-light": Sun,
  "pbi-dark": Moon,
};

/**
 * Representative colours for each theme's swatch — page, card, and three accents.
 * These mirror the CSS variables in globals.css but are inlined here on purpose:
 * the theme variables are scoped to `:root[data-theme]`, so a nested preview can't
 * re-derive them. Kept in sync by hand with the three blocks in globals.css.
 */
const SWATCH: Record<ThemeId, { bg: string; card: string; dots: [string, string, string] }> = {
  vantage: { bg: "#000000", card: "#1a1a1a", dots: ["#e0b252", "#2dd4bf", "#4f9dff"] },
  "pbi-light": { bg: "#f4f5f7", card: "#ffffff", dots: ["#c19100", "#01998e", "#118dff"] },
  "pbi-dark": { bg: "#1b1a19", card: "#323130", dots: ["#f2c811", "#01d5c4", "#4aa3ff"] },
};

/**
 * Theme picker. Purely a client preference — it never touches the server or the
 * figures, only which set of CSS variables <html> selects. The choice is kept in
 * localStorage and re-applied before paint by the init script in the root layout,
 * so it survives reloads and follows the person, not the account.
 */
export function ThemeSelector() {
  const [active, setActive] = useState<ThemeId>(DEFAULT_THEME);

  // Read the persisted choice on mount (localStorage is client-only).
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    if (stored && THEMES.some((t) => t.id === stored)) setActive(stored);
  }, []);

  const choose = (id: ThemeId) => {
    setActive(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    applyTheme(id);
  };

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {THEMES.map((t) => {
        const Icon = ICONS[t.id];
        const sw = SWATCH[t.id];
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => choose(t.id)}
            aria-pressed={on}
            className={cn(
              "group relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
              on
                ? "border-gold/50 bg-gold-dim"
                : "border-border bg-elevated/40 hover:border-[var(--hairline)]",
            )}
          >
            {/* Swatch — a miniature of the theme's page/card/accents. */}
            <span
              className="flex h-12 w-full items-center gap-1.5 overflow-hidden rounded-md border border-border px-2"
              style={{ background: sw.bg }}
            >
              <span className="h-6 w-8 rounded-sm" style={{ background: sw.card, border: "1px solid rgba(128,128,128,0.25)" }} />
              {sw.dots.map((c) => (
                <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
              ))}
            </span>

            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                {t.label}
              </span>
              {on && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold/20 text-gold">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">{t.description}</span>
          </button>
        );
      })}
    </div>
  );
}
