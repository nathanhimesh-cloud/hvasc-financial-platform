import { PeriodSelector } from "@/components/kit/period-selector";
import { PrintButton } from "@/components/kit/print-button";
import { InfoPopover, InfoNote } from "@/components/kit/info-popover";
import type { PeriodView } from "@/lib/periods";

/**
 * The one toolbar every page uses.
 *
 * Before this, each screen invented its own header: some had a period selector,
 * some didn't; the print button was on the left on one page and the right on
 * another; provenance ("data as at…") was repeated three times per screen in three
 * different typefaces. It read like six people had built six products.
 *
 * The shape is fixed now, left to right:
 *
 *     [ period ]  [ page filters ]  ·············  [ actions ] [ ⓘ ]
 *
 * `filters` is where a page hangs its own controls (a search box, a date range, a
 * department picker). `notes` is where the methodology goes — behind the icon,
 * out of the reading path, one click away.
 */
export function PageToolbar({
  view,
  filters,
  actions,
  notes,
  notable,
  alertCount,
  print = true,
}: {
  view: PeriodView;
  /** Page-specific filters — rendered next to the period selector. */
  filters?: React.ReactNode;
  /** Page-specific actions (export, upload) — rendered before Print. */
  actions?: React.ReactNode;
  /** Methodology and provenance. Goes behind the info icon. */
  notes?: React.ReactNode;
  /** Highlights the info icon — use when there's something genuinely worth reading. */
  notable?: boolean;
  /** Failing checks. Shown as a red badge on the info icon so it cannot be missed. */
  alertCount?: number;
  print?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelector
          periods={view.periods}
          selected={view.selected}
          isLatest={view.isLatest}
          hasHistory={view.hasHistory}
        />
        {filters}
      </div>

      <div className="no-print flex items-center gap-2">
        {actions}
        {print && <PrintButton />}
        <InfoPopover notable={notable} alertCount={alertCount}>
          {notes}
          {/* Provenance, on every page, in exactly one place. */}
          <InfoNote label="Source">
            Live read-only feed from Civica Practical Plus (
            <span className="font-mono">DSN=Practical_Plus</span>), synced three times a day.
            {view.selected.generatedAt && <> Data as at {view.selected.generatedAt}.</>}{" "}
            {!view.hasHistory && (
              <>Only one period has been synced so far, so the period selector has nothing to move between yet.</>
            )}
          </InfoNote>
          <InfoNote label="Accuracy">
            The platform never writes to Practical. Every figure depends on the accuracy of what is
            recorded there.
          </InfoNote>
        </InfoPopover>
      </div>
    </div>
  );
}
