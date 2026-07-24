import {
  LayoutDashboard,
  Landmark,
  Briefcase,
  FileClock,
  FileText,
  FileBarChart,
  Gauge,
  LayoutGrid,
  Activity,
  Tags,
  ShieldCheck,
  Settings,
  HelpCircle,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Content, Panel, PanelHeader, SectionLabel, PageIntro } from "@/components/kit/panel";
import { getSession } from "@/lib/auth/session";
import { can, type Capability } from "@/lib/auth/roles";

export const metadata = { title: "Help Centre" };

/** Which capability each Data Tool link needs; absent = visible to everyone. */
const TOOL_CAP: Record<string, Capability> = {
  "/mapping": "mapping.edit",
  "/audit": "audit.view",
};

/**
 * The manual.
 *
 * Several pages here present a figure that exists nowhere in Practical —
 * committed spend, restricted cash, the sustainability ratios. A number nobody
 * understands is a number nobody trusts, and a number nobody trusts doesn't get
 * used. So this documents what each page is, what its figures mean, and — the
 * part people actually need — which figures look wrong but aren't.
 */

interface PageDoc {
  href: string;
  icon: LucideIcon;
  title: string;
  /** One line: what question does this page answer? */
  purpose: string;
  /** What the figures mean, in the reader's terms. */
  explains: { term: string; meaning: string }[];
  /** The thing that makes people think it's broken. */
  gotcha?: string;
}

const PAGES: PageDoc[] = [
  {
    href: "/",
    icon: LayoutDashboard,
    title: "CFO Dashboard",
    purpose: "Where the Council stands today: spend against budget, cash, and grant dependency.",
    explains: [
      {
        term: "Budget to date",
        meaning:
          "Not the annual budget divided by twelve. Practical phases the budget across the year and this reads that phasing. Judging September's spend against a whole year's budget would make every department look wonderful.",
      },
      {
        term: "Unrestricted cash",
        meaning:
          "Total cash less money that can only be spent on the grant that funded it. This is what the Council can actually choose to spend. Shown as a ceiling (\"at most\") because a few grants are missing job codes, and every unmeasurable restricted dollar makes this figure look higher than it truly is.",
      },
      {
        term: "Months of cover",
        meaning:
          "How many months of operating costs the unrestricted cash would fund. Depreciation is excluded — it consumes no bank balance, so it cannot shorten a cash runway.",
      },
    ],
  },
  {
    href: "/grants",
    icon: Landmark,
    title: "Grant Tracker",
    purpose: "Every grant: what was awarded, what has arrived, what has been spent.",
    explains: [
      {
        term: "Spent to date",
        meaning:
          "Summed from the general ledger via the job codes the register assigns to each grant. Nobody types this figure in — which is the point of it.",
      },
      {
        term: "Restricted",
        meaning:
          "Money that may only be spent on its funded purpose. Unspent restricted grant money is not the Council's to use.",
      },
    ],
    gotcha:
      "Some grants show a partial figure and a warning. The register lists a wildcard or free text where a job code should be, so their spend cannot be summed. We flag them rather than show a confident $0. This affects those grants' own spend lines only — never the financial statements.",
  },
  {
    href: "/jobs",
    icon: Briefcase,
    title: "Job Budgets",
    purpose: "Budget vs actual vs committed, for every job the Council runs.",
    explains: [
      {
        term: "Budget",
        meaning:
          "Sits on the GL account, not the job — that is how Practical stores it. In the FY26 export only 12 of 384 jobs carried a budget of their own, so this mirrors Practical's own Jobs Budget report: budget from the account, actuals from the jobs beneath it.",
      },
      {
        term: "Actual vs job-costed",
        meaning:
          "\"Actual\" is the account's whole balance. \"Job-costed\" is only the part carrying a job code. The gap is spend posted without a job — shown, rather than quietly netted away.",
      },
      {
        term: "Committed",
        meaning:
          "Ordered on a purchase order but not yet invoiced. A job can be comfortably under budget on actuals and already over-committed on orders — and nothing in Practical would tell you.",
      },
    ],
  },
  {
    href: "/commitments",
    icon: FileClock,
    title: "Commitments & Debtors",
    purpose: "Money in flight — promised out, and owed in. None of it is in the general ledger.",
    explains: [
      {
        term: "Committed",
        meaning:
          "Value ordered but not yet invoiced. It has left the Council in every sense that matters, but it hasn't touched a GL account, so it is invisible in every other report.",
      },
      {
        term: "Capital works in progress",
        meaning:
          "Spend accumulating on projects that aren't finished. It becomes an asset when the work completes. Not depreciated yet, which is why it is correctly left out of the asset ratios.",
      },
      {
        term: "Ageing (30 / 60 / 90+)",
        meaning:
          "How overdue each debt is. Practical ages these itself at end of month — nothing here is recomputed.",
      },
    ],
    gotcha:
      "Some orders raised over a year ago were never invoiced or closed off. They are counted separately and excluded from the commitment total — an order nobody has actioned in a year is more likely an untidy ledger than a live obligation. They are shown, so the exclusion is visible rather than silent.",
  },
  {
    href: "/reports",
    icon: FileText,
    title: "Detailed Reports",
    purpose: "The three financial statements, and every transaction behind them.",
    explains: [
      {
        term: "Accuracy checks",
        meaning:
          "Four rules that must always hold: the Balance Sheet balances, the Cash Flow reconciles, cash agrees across both statements, and the net result ties to the movement in equity. If one fails, the figures are marked Draft. A failure almost always means an unmapped account or a period mismatch — not a typo.",
      },
      {
        term: "Cash Flow",
        meaning:
          "Built from Practical's own Cash Flow report definition, not a rule we invented. A few accounts move cash without being mapped to a line in that report; they appear as \"Other operating\" so the statement still ties to the cent, and the unmapped accounts are named so they can be fixed in Practical.",
      },
    ],
    gotcha:
      "Early in the financial year, expenses can read NEGATIVE. That is June's year-end accruals reversing in July. It is expected, and it is why the first months look odd.",
  },
  {
    href: "/monthly-report",
    icon: FileBarChart,
    title: "Monthly Report",
    purpose: "The management pack — one for the CFO, one per department. Print or PDF it.",
    explains: [
      {
        term: "Consolidated vs departmental",
        meaning:
          "The same figures at two altitudes. The consolidated pack is what goes to Council; the departmental packs are what a manager needs to explain their own numbers.",
      },
    ],
  },
  {
    href: "/ratios",
    icon: Gauge,
    title: "Sustainability Ratios",
    purpose: "The Queensland statutory measures the Council is assessed on.",
    explains: [
      {
        term: "Tier 8",
        meaning:
          "Hope Vale's tier under the Financial Management (Sustainability) Guideline 2024. Benchmarks differ by tier, and the Operating Surplus Ratio has NO benchmark for Tier 8 — so it is reported and never flagged.",
      },
      {
        term: "Why last year's figures?",
        meaning:
          "These are annual measures. The Council raises its rates once a year and receives most grant income late, so a surplus ratio calculated from July alone would be wildly negative and mean nothing. Flow ratios report on the last complete year; cash cover and the asset ratios are point-in-time and current.",
      },
      {
        term: "Not yet computable",
        meaning:
          "Some measures need data the finance system doesn't hold — an asset renewal flag, ABS population figures. The page says which, and who can supply it, rather than showing a guess.",
      },
    ],
  },
  {
    href: "/departments",
    icon: LayoutGrid,
    title: "Departments",
    purpose: "The Council's three management departments, and a drill-down into each.",
    explains: [
      {
        term: "Depreciation excluded",
        meaning:
          "Depreciation is not controllable spend — no manager can decide to depreciate less. Including it made Administration look 109% over budget when it wasn't.",
      },
    ],
  },
];

const TOOLS: PageDoc[] = [
  {
    href: "/status",
    icon: Activity,
    title: "Data Status",
    purpose: "Every sync: when it ran, what it carried, whether it was accepted.",
    explains: [
      {
        term: "Start here when a figure looks wrong",
        meaning:
          "If the last sync is old or failed, you are looking at stale figures — and the platform says so rather than let a stale number pass for a live one.",
      },
    ],
  },
  {
    href: "/mapping",
    icon: Tags,
    title: "Account Mapping",
    purpose: "Which GL account belongs to which department.",
    explains: [
      {
        term: "What this changes",
        meaning:
          "How reports GROUP figures — never a figure itself. An account with no department is money that appears in no department total, so unmapped accounts are sorted to the top with a count.",
      },
    ],
  },
  {
    href: "/audit",
    icon: ShieldCheck,
    title: "Audit Log",
    purpose: "Who changed what, from what, to what, and when. Immutable.",
    explains: [
      {
        term: "What can be changed at all",
        meaning:
          "Reporting metadata only — account names, department assignments, grant milestones. No role can edit a financial figure, including administrators. That separation is the platform's central control.",
      },
    ],
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Expenses are NEGATIVE. Is that a bug?",
    a: "No — it's July. At year-end the Council accrues costs it expects but hasn't been billed for. Those accruals reverse in the new year, which produces negative expenditure until real invoices arrive. It corrects itself within a month or two.",
  },
  {
    q: "A chart looks empty early in the year.",
    a: "A monthly trend needs months. In July there is one, which is a rectangle, not a trend — so the platform plots DAILY spend instead, and says so. Once three months exist it switches back to monthly on its own.",
  },
  {
    q: "The Operating Surplus Ratio has no target. Is that missing?",
    a: "No. It is contextual for a Tier 8 council — the Guideline sets no benchmark. The platform reports the value and never flags it, because telling the CEO they are failing a test they are not sitting would be worse than showing nothing at all.",
  },
  {
    q: "Some grants show a warning instead of a spend figure.",
    a: "The Council's grant register lists a wildcard or free text where a GL or job code should be, so that grant's spend cannot be summed from the ledger. It affects those grants only — never the financial statements. The fix is a job code from the Council.",
  },
  {
    q: 'Cash figures say "at most" rather than an exact number.',
    a: "Some restricted grants are missing an opening balance or a job code, so their unspent balance can't be measured exactly. Every unmeasurable restricted dollar makes unrestricted cash look HIGHER than it is — so the platform reports a ceiling and says so, rather than a precise figure it cannot stand behind.",
  },
  {
    q: "How do I know the latest data actually arrived?",
    a: "Data Status shows every sync, what it carried, and whether the ledger accepted it. The sync itself also reports back exactly which blocks it stored — statements, ratios, commitments, ageing, assets — so a missing one is visible immediately rather than discovered later.",
  },
];

export default async function SupportPage() {
  // Only show a Data Tool card the current role can actually open — otherwise a
  // read-only user clicks "Account Mapping" / "Audit Log" and hits "Page not found".
  const session = await getSession();
  const tools = TOOLS.filter((t) => !TOOL_CAP[t.href] || can(session?.role, TOOL_CAP[t.href]));

  return (
    <Content className="max-w-4xl">
      <PageIntro>
        What every page means, in plain terms — and the handful of figures that look wrong but
        aren&apos;t. Built and maintained by SandS Australia for Hope Vale Aboriginal Shire Council.
      </PageIntro>

      {/* The one rule that governs everything else. */}
      <Panel className="mb-6 mt-6 border-green/25 bg-green/[0.03]">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-green" strokeWidth={1.75} />
          <div>
            <div className="text-[14px] font-semibold text-foreground">
              The platform never writes to Practical.
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Every figure is read — read-only — from the Council&apos;s own general ledger, and
              refreshed three times a day. Nothing done here can change a number in the accounting
              system, and no role, not even an administrator, can edit a financial figure. What this
              platform adds is not new data. It is the arithmetic, the checks, and the things Practical
              holds but never shows you.
            </p>
          </div>
        </div>
      </Panel>

      <SectionLabel hint="what each one is for">The pages</SectionLabel>
      <div className="mb-8 flex flex-col gap-3">
        {PAGES.map((p) => (
          <PageCard key={p.href} doc={p} />
        ))}
      </div>

      <SectionLabel hint="found under Settings">Data tools</SectionLabel>
      <div className="mb-8 flex flex-col gap-3">
        {tools.map((p) => (
          <PageCard key={p.href} doc={p} />
        ))}
      </div>

      <SectionLabel hint="the ones people ask about">
        Figures that look wrong but aren&apos;t
      </SectionLabel>
      <Panel className="mb-8">
        {FAQS.map((f) => (
          <Faq key={f.q} q={f.q} a={f.a} />
        ))}
      </Panel>

      <Panel>
        <PanelHeader title="Support" subtitle="SandS Australia" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          If a figure looks wrong, check{" "}
          <Link href="/status" className="text-gold-light underline-offset-2 hover:underline">
            Data Status
          </Link>{" "}
          first — a stale sync explains most surprises. If it still looks wrong, that is worth knowing
          about: the accuracy checks on{" "}
          <Link href="/reports" className="text-gold-light underline-offset-2 hover:underline">
            Detailed Reports
          </Link>{" "}
          exist precisely so that a wrong number cannot sit there quietly.
        </p>
        <Link
          href="/account"
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-[rgba(255,255,255,0.2)]"
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} />
          Settings &amp; data tools
        </Link>
      </Panel>
    </Content>
  );
}

function PageCard({ doc }: { doc: PageDoc }) {
  const Icon = doc.icon;
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-gold">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={doc.href}
            className="text-[14px] font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {doc.title}
          </Link>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{doc.purpose}</p>

          <dl className="mt-3 flex flex-col gap-2.5">
            {doc.explains.map((e) => (
              <div key={e.term}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-foreground">
                  {e.term}
                </dt>
                <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {e.meaning}
                </dd>
              </div>
            ))}
          </dl>

          {doc.gotcha && (
            <p className="mt-3 rounded-md border border-amber/25 bg-amber/[0.04] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-amber">
                Worth knowing ·{" "}
              </span>
              {doc.gotcha}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-border last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-3.5 text-[13px] font-medium text-foreground marker:hidden">
        <HelpCircle className="h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex-1">{q}</span>
        <ChevronRight
          className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          strokeWidth={1.75}
        />
      </summary>
      <p className="pb-4 pl-7 pr-2 text-[13px] leading-relaxed text-muted-foreground">{a}</p>
    </details>
  );
}
