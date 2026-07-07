/**
 * Budget vs Actual report — by Report Group / directorate (Shaun's request:
 * "job-wise budget tracking … see the reports").
 *
 * Mirrors Practical's "Revenue and Expenditure Report" filtered by Report Group
 * (Corporate Services / Operations / Social Services). Each report is a tree —
 * Program → Sub-program → Account — with three column groups (Revenue, Expense,
 * Surplus/(Deficiency)), each showing Actual · % · full-year Budget, and
 * subtotals rolling up at every level.
 *
 * The raw data is a flat list of account leaves tagged with their grouping; the
 * builder here folds them into the tree and computes every subtotal, so the
 * roll-ups are always internally consistent (and can be tied back to the source
 * report's printed subtotals — see scripts verification).
 */

export type BudgetKind = "revenue" | "expense";

/** One general-ledger account line in the report. */
export interface BudgetLeaf {
  code: string;
  name: string;
  kind: BudgetKind;
  /** Actual for the period to date (near zero early in the year). */
  actual: number;
  /** Full-year adopted budget. */
  budget: number;
  /** Program grouping, e.g. "1000-0001 ADMINISTRATION". */
  program: string;
  /** Sub-program grouping, e.g. "1200-0002 GENERAL ADMINISTRATION". */
  sub?: string;
  /** Optional third grouping level, e.g. "4040-0003 PARKS & GARDENS - COUNCIL". */
  sub3?: string;
}

/** A directorate / Practical Report Group. */
export interface BudgetGroup {
  id: string;
  /** Directorate name, e.g. "Corporate Services". */
  name: string;
  /** Practical report-group filter, e.g. "Finance Director". */
  manager: string;
  leaves: BudgetLeaf[];
}

export interface BudgetReportData {
  fyLabel: string;
  /** "As at" date of the actuals column, e.g. "31 Jul 2026". */
  asAt: string;
  /** Fraction of the financial year elapsed (0–1), for the pro-rata guide. */
  yearElapsedPct: number;
  source: string;
  groups: BudgetGroup[];
}

/** A node in the rendered tree (leaf or roll-up). */
export interface BudgetNode {
  code: string;
  label: string;
  level: number;
  isLeaf: boolean;
  kind?: BudgetKind;
  revenueActual: number;
  revenueBudget: number;
  expenseActual: number;
  expenseBudget: number;
  children: BudgetNode[];
}

export interface BudgetGroupTotals {
  revenueActual: number;
  revenueBudget: number;
  expenseActual: number;
  expenseBudget: number;
  surplusActual: number;
  surplusBudget: number;
}

export interface BudgetGroupTree {
  id: string;
  name: string;
  manager: string;
  nodes: BudgetNode[];
  totals: BudgetGroupTotals;
}

function splitLabel(codeLabel: string): { code: string; label: string } {
  const space = codeLabel.indexOf(" ");
  if (space < 0) return { code: codeLabel, label: codeLabel };
  return { code: codeLabel.slice(0, space), label: codeLabel.slice(space + 1) };
}

function emptyNode(codeLabel: string, level: number): BudgetNode {
  const { code, label } = splitLabel(codeLabel);
  return {
    code,
    label,
    level,
    isLeaf: false,
    revenueActual: 0,
    revenueBudget: 0,
    expenseActual: 0,
    expenseBudget: 0,
    children: [],
  };
}

function leafNode(leaf: BudgetLeaf, level: number): BudgetNode {
  return {
    code: leaf.code,
    label: leaf.name,
    level,
    isLeaf: true,
    kind: leaf.kind,
    revenueActual: leaf.kind === "revenue" ? leaf.actual : 0,
    revenueBudget: leaf.kind === "revenue" ? leaf.budget : 0,
    expenseActual: leaf.kind === "expense" ? leaf.actual : 0,
    expenseBudget: leaf.kind === "expense" ? leaf.budget : 0,
    children: [],
  };
}

/** Sum children's amounts into a parent node (mutates parent). */
function rollUp(node: BudgetNode): void {
  if (node.isLeaf) return;
  node.revenueActual = 0;
  node.revenueBudget = 0;
  node.expenseActual = 0;
  node.expenseBudget = 0;
  for (const c of node.children) {
    rollUp(c);
    node.revenueActual += c.revenueActual;
    node.revenueBudget += c.revenueBudget;
    node.expenseActual += c.expenseActual;
    node.expenseBudget += c.expenseBudget;
  }
}

/**
 * Fold a group's flat leaves into the Program → Sub → Sub3 → Account tree and
 * compute every subtotal.
 */
export function buildGroupTree(group: BudgetGroup): BudgetGroupTree {
  const programs = new Map<string, BudgetNode>();

  const ensure = (
    map: Map<string, BudgetNode>,
    key: string,
    level: number,
  ): BudgetNode => {
    let node = map.get(key);
    if (!node) {
      node = emptyNode(key, level);
      map.set(key, node);
    }
    return node;
  };

  // Track child-index maps per parent so grouping stays stable & ordered.
  const subIndex = new Map<BudgetNode, Map<string, BudgetNode>>();
  const childMap = (parent: BudgetNode) => {
    let m = subIndex.get(parent);
    if (!m) {
      m = new Map();
      subIndex.set(parent, m);
    }
    return m;
  };

  for (const leaf of group.leaves) {
    const program = ensure(programs, leaf.program, 0);
    let parent = program;
    if (leaf.sub) {
      const subs = childMap(program);
      const sub = subs.get(leaf.sub) ?? attach(program, emptyNode(leaf.sub, 1), subs, leaf.sub);
      parent = sub;
    }
    if (leaf.sub3) {
      const s3s = childMap(parent);
      const s3 = s3s.get(leaf.sub3) ?? attach(parent, emptyNode(leaf.sub3, parent.level + 1), s3s, leaf.sub3);
      parent = s3;
    }
    parent.children.push(leafNode(leaf, parent.level + 1));
  }

  const nodes = [...programs.values()];
  nodes.forEach(rollUp);

  const totals = nodes.reduce<BudgetGroupTotals>(
    (t, n) => ({
      revenueActual: t.revenueActual + n.revenueActual,
      revenueBudget: t.revenueBudget + n.revenueBudget,
      expenseActual: t.expenseActual + n.expenseActual,
      expenseBudget: t.expenseBudget + n.expenseBudget,
      surplusActual: 0,
      surplusBudget: 0,
    }),
    { revenueActual: 0, revenueBudget: 0, expenseActual: 0, expenseBudget: 0, surplusActual: 0, surplusBudget: 0 },
  );
  totals.surplusActual = totals.revenueActual - totals.expenseActual;
  totals.surplusBudget = totals.revenueBudget - totals.expenseBudget;

  return { id: group.id, name: group.name, manager: group.manager, nodes, totals };
}

function attach(
  parent: BudgetNode,
  node: BudgetNode,
  index: Map<string, BudgetNode>,
  key: string,
): BudgetNode {
  parent.children.push(node);
  index.set(key, node);
  return node;
}

/** Surplus/(deficiency) = revenue − expense, for any node. */
export function nodeSurplus(node: BudgetNode): { actual: number; budget: number } {
  return {
    actual: node.revenueActual - node.expenseActual,
    budget: node.revenueBudget - node.expenseBudget,
  };
}
