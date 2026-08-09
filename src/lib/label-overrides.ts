/**
 * Council-requested display names for GL accounts whose Practical descriptions
 * are ambiguous on screen.
 *
 * Display layer ONLY. The feed, the integrity checks and the raw exports keep
 * Practical's own account names, so every figure stays traceable to the ledger —
 * the rename happens at the last moment before a label reaches the screen.
 *
 * Source: Hope Vale dashboard review (Aug 2026). "Cash at Bank" is the Council's
 * Westpac operating account and should say so, so a reader can tell at a glance
 * which balance sits where. Add further renames here (keyed by GL code first,
 * exact description as fallback) as Micah's restricted/unrestricted account
 * clean-up lands.
 */

/** Renames keyed by GL account code — the reliable key when the feed carries it. */
const CODE_OVERRIDES: Record<string, string> = {
  "0105-3000-0000": "Westpac Cash at Bank",
};

/** Fallback renames keyed by Practical's exact account description. */
const NAME_OVERRIDES: Record<string, string> = {
  "Cash at Bank": "Westpac Cash at Bank",
};

/** The label to show on screen for an account line. */
export function displayAccountLabel(label: string, code?: string): string {
  if (code) {
    const byCode = CODE_OVERRIDES[code.trim()];
    if (byCode) return byCode;
  }
  return NAME_OVERRIDES[label.trim()] ?? label;
}
