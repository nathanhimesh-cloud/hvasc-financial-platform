import {
  BookOpen,
  Mail,
  Phone,
  Database,
  Upload,
  Tags,
  LayoutDashboard,
  Landmark,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { Content, Panel, PanelHeader, SectionLabel, PageIntro } from "@/components/kit/panel";

export const metadata = { title: "Help Centre" };

export default function SupportPage() {
  return (
    <Content className="max-w-4xl">
      <PageIntro>
        Everything you need to read, refresh, and trust the figures on this
        platform. Built and maintained by SandS Australia for Hope Vale
        Aboriginal Shire Council.
      </PageIntro>

      {/* ── How-to guides ─────────────────────────────────────────────── */}
      <div className="mt-6">
        <SectionLabel hint="step by step">How-to guides</SectionLabel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Guide
            icon={LayoutDashboard}
            title="Read the CFO Dashboard"
            steps={[
              "The top cards show year-to-date income, expenses and net result for the council.",
              "Department cards show operating spend by function, with a status colour (on-track / at-risk / over-budget).",
              "An “EST.” tag means a figure is compared to last year (FY25), because this year's budget isn't loaded yet.",
            ]}
          />
          <Guide
            icon={Landmark}
            title="Track grants"
            steps={[
              "Grant Tracker lists funding received per grant account, grouped by department.",
              "“FUNDING RECEIVED” means the money is in; spend % and deadlines need the grants register.",
              "Send SandS the grants register spreadsheet to unlock acquittal dates and spend tracking.",
            ]}
          />
          <Guide
            icon={Database}
            title="How the data refreshes"
            steps={[
              "Figures come straight from Civica Practical's general ledger via a read-only overnight feed.",
              "It runs automatically each night on the council server — no manual exports needed.",
              "The “updated” date in the top bar shows when the figures were last refreshed.",
            ]}
          />
          <Guide
            icon={Upload}
            title="Upload data manually"
            steps={[
              "If a one-off refresh is needed, open Data Upload and drag the Practical export files in.",
              "Include the current-year “Analysis by function” (Note 3a) — it's the required file.",
              "The dashboard updates within a few seconds; no redeploy required.",
            ]}
          />
        </div>
      </div>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SectionLabel hint="common questions">FAQ</SectionLabel>
        <Panel className="hover:border-border">
          <Faq
            q="Why do some figures say “EST.” or “FY25”?"
            a="The FY2026 budget hasn't been entered into Practical yet, so the platform compares this year's actuals against last year's (FY25) actuals as a baseline. Those comparisons are clearly marked as estimates. Once the budget is loaded, they become real budget-vs-actual."
          />
          <Faq
            q="Are these the same numbers as our official statements?"
            a="The net result ties to the council's income statement within about half a percent. Department spend uses the general ledger's native function structure, and operating expenses exclude depreciation so the bottom line matches. Small timing differences can appear because the feed reads the live ledger, which keeps moving."
          />
          <Faq
            q="How current is the data?"
            a="It refreshes automatically every night from the live Practical database. The date shown in the top bar is the last successful refresh."
          />
          <Faq
            q="Why don't grants show how much has been spent?"
            a="Practical records grant money received, but linking spend to a specific grant needs the council's grants register (which job codes belong to which grant). Send that spreadsheet to SandS and grant spend + acquittal deadlines will switch on."
          />
          <Faq
            q="Is any of our data exposed publicly?"
            a="No. The platform is private, blocked from search engines, and reads the accounting system strictly read-only — it can never change a figure in Practical."
          />
        </Panel>
      </div>

      {/* ── Contact + resources ───────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Panel className="hover:border-border">
          <PanelHeader title="Contact" subtitle="SANDS AUSTRALIA SUPPORT" />
          <p className="mb-4 text-[13px] text-muted-foreground">
            For data questions, access issues, or feature requests, reach the
            team below.
          </p>
          <div className="flex flex-col gap-3">
            <ContactRow icon={Mail} label="Email" value="info@sandsaustralia.com" href="mailto:info@sandsaustralia.com" />
            <ContactRow icon={Phone} label="Phone" value="+61 3 7044 0504" href="tel:+61370440504" />
          </div>
        </Panel>

        <Panel className="hover:border-border">
          <PanelHeader title="Reference docs" subtitle="IN THIS PROJECT" />
          <div className="flex flex-col gap-2.5 text-[13px]">
            <DocRow icon={LayoutDashboard} file="docs/DASHBOARD-EXPLAINER.md" desc="What every screen means, in plain English" />
            <DocRow icon={Database} file="docs/DATA-REQUIREMENTS.md" desc="What each view shows + its source" />
            <DocRow icon={Tags} file="docs/ACCESS-GUIDE.md" desc="Connecting to the Practical system" />
            <DocRow icon={BookOpen} file="docs/ROADMAP.md" desc="Planned features, in order" />
          </div>
        </Panel>
      </div>
    </Content>
  );
}

function Guide({
  icon: Icon,
  title,
  steps,
}: {
  icon: typeof Database;
  title: string;
  steps: string[];
}) {
  return (
    <Panel className="hover:border-border">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-elevated">
          <Icon className="h-4 w-4 text-foreground" strokeWidth={1.75} />
        </span>
        <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-border font-mono text-[9px] text-subtle">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-border last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-3.5 text-[13px] font-medium text-foreground marker:hidden">
        <HelpCircle className="h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex-1">{q}</span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-90" strokeWidth={1.75} />
      </summary>
      <p className="pb-4 pl-7 pr-2 text-[13px] leading-relaxed text-muted-foreground">{a}</p>
    </details>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-[rgba(255,255,255,0.16)] hover:bg-card-hover"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-elevated">
        <Icon className="h-4 w-4 text-foreground" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        <span className="text-[13px] text-foreground">{value}</span>
      </div>
    </a>
  );
}

function DocRow({ icon: Icon, file, desc }: { icon: typeof BookOpen; file: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="font-mono text-[12px] text-foreground">{file}</span>
      <span className="text-muted-foreground">— {desc}</span>
    </div>
  );
}
