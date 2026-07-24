/**
 * Theme model.
 *
 * The app was born dark ("Vantage"). Micah asked for a Power BI look — light and
 * dark — that the whole dashboard, charts included, honours. Every colour the UI
 * paints with is a CSS variable (see globals.css), so a theme is nothing more than
 * a different set of those variables selected by `data-theme` on <html>. The charts
 * re-theme for free because lib/colors.ts hands Recharts/SVG the variables, not hex.
 *
 * Vantage is the default and carries NO attribute — its values live on bare :root,
 * so a user who never opens Settings sees exactly what shipped.
 */
export type ThemeId = "vantage" | "pbi-light" | "pbi-dark";

export const THEME_STORAGE_KEY = "vantage-theme";
export const DEFAULT_THEME: ThemeId = "vantage";

export const THEMES: { id: ThemeId; label: string; description: string; scheme: "dark" | "light" }[] = [
  { id: "vantage", label: "Vantage Dark", description: "The signature dark theme.", scheme: "dark" },
  { id: "pbi-light", label: "Power BI Light", description: "Light grey page, white cards.", scheme: "light" },
  { id: "pbi-dark", label: "Power BI Dark", description: "Power BI's dark report palette.", scheme: "dark" },
];

/** Apply a theme to <html> — the single place that touches the DOM attributes. */
export function applyTheme(id: ThemeId) {
  const el = document.documentElement;
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  if (id === "vantage") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", id);
  // Tailwind's `dark:` variants should fire for both dark themes, not the light one.
  el.classList.toggle("dark", theme.scheme === "dark");
  el.style.colorScheme = theme.scheme;
}

/**
 * Blocking script injected in <head> so the correct theme is on <html> BEFORE the
 * first paint — otherwise a light-theme user sees a black flash on every load.
 * Kept dependency-free and inlined; it runs before React hydrates.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=document.documentElement;if(t==='pbi-light'){d.setAttribute('data-theme','pbi-light');d.classList.remove('dark');d.style.colorScheme='light';}else if(t==='pbi-dark'){d.setAttribute('data-theme','pbi-dark');d.classList.add('dark');d.style.colorScheme='dark';}else{d.removeAttribute('data-theme');d.classList.add('dark');d.style.colorScheme='dark';}}catch(e){}})();`;
