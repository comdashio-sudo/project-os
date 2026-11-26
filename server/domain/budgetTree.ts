// Q-65 (batch 1): a hierarchical budget as a project's cost people write it — one sheet whose rows carry a WBS code (GC.26037-000.03.01), a description, an amount on the
// leaves (usually) and sometimes on a parent, and for a parent that is split between its children by PERCENT, a percentage on each child instead of an amount. This module is
// the arithmetic and nothing else (no file, no database): it builds the tree from the codes, adds the leaves up to every parent, shows where a parent's written amount differs
// from the sum of its children (never silently changing either), and gives a percentage child its share of the parent's written amount. An amount that is not known stays null
// («—» on the screen), never 0.

export type BudgetTreeRow = { rowNumber: number; code: string; description: string; amount: number | null; percent?: number | null };

export type BudgetNode = {
  code: string; description: string; rowNumber: number; parentCode: string | null; childCodes: string[];
  /** what the file wrote on this row (null when it wrote none) */
  written: number | null;
  /** the percentage the file wrote on this row, when its parent's amount is split by percent */
  percent: number | null;
  /** a leaf's amount: what it wrote, or its percentage of the parent's written amount; null when neither is known */
  own: number | null;
  /** how the leaf's amount was found: written in the file, or allocated from the parent by its percentage */
  source: "written" | "allocated" | "none";
  /** this node's amount for the whole branch: a leaf's own amount, or the sum of its children (null when no leaf below has one) */
  total: number | null;
};

export type BudgetTree = {
  nodes: BudgetNode[]; // in the file's order
  roots: string[];
  leaves: number;
  /** the sum of the roots' totals: the budget as the tree adds up */
  total: number;
  /** a parent that wrote an amount which differs from the sum of its children (both are kept; the person decides) */
  parentDifferences: Array<{ code: string; description: string; rowNumber: number; written: number; childrenSum: number; difference: number }>;
  /** the children of a percent-split parent whose percentages do not add to 100 */
  percentSplits: Array<{ code: string; rowNumber: number; percentSum: number }>;
  /** a code that appears twice (the second is ignored) */
  duplicates: Array<{ code: string; rowNumber: number }>;
  /** leaves with no amount and no percentage to allocate */
  withoutAmount: string[];
};

const EPSILON = 0.005;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const SEPARATOR = /[.\-/]/;

/** The nearest ancestor of a code among the codes present: the longest other code that is a prefix of it ending at a separator (GC.1-000.03 → GC.1-000), or null for a root. */
function parentOf(code: string, present: Set<string>): string | null {
  let best: string | null = null;
  for (let index = code.length - 1; index > 0; index--) {
    if (!SEPARATOR.test(code[index])) continue;
    const prefix = code.slice(0, index);
    if (present.has(prefix)) { best = prefix; break; }
  }
  return best;
}

export function buildBudgetTree(rows: readonly BudgetTreeRow[]): BudgetTree {
  const duplicates: BudgetTree["duplicates"] = [];
  const first = new Map<string, BudgetTreeRow>();
  for (const row of rows) {
    const code = row.code.trim();
    if (!code) continue;
    if (first.has(code)) { duplicates.push({ code, rowNumber: row.rowNumber }); continue; }
    first.set(code, { ...row, code });
  }
  const present = new Set(Array.from(first.keys()));
  const nodes = new Map<string, BudgetNode>();
  for (const [code, row] of Array.from(first.entries())) {
    nodes.set(code, { code, description: row.description.trim(), rowNumber: row.rowNumber, parentCode: parentOf(code, present), childCodes: [], written: row.amount, percent: row.percent ?? null, own: null, source: "none", total: null });
  }
  for (const node of Array.from(nodes.values())) if (node.parentCode) nodes.get(node.parentCode)!.childCodes.push(node.code);

  const percentSplits: BudgetTree["percentSplits"] = [];
  const parentDifferences: BudgetTree["parentDifferences"] = [];
  const withoutAmount: string[] = [];

  // a leaf's amount: what it wrote, or its percentage of the parent's written amount
  for (const node of Array.from(nodes.values())) {
    if (node.childCodes.length) continue;
    if (node.written !== null) { node.own = node.written; node.source = "written"; }
    else if (node.percent !== null && node.parentCode && nodes.get(node.parentCode)!.written !== null) { node.own = round2(nodes.get(node.parentCode)!.written! * node.percent / 100); node.source = "allocated"; }
    else withoutAmount.push(node.code);
  }
  // percentages that split a parent must add to 100
  for (const node of Array.from(nodes.values())) {
    const percents = node.childCodes.map(code => nodes.get(code)!).filter(child => child.percent !== null && child.written === null);
    if (!percents.length) continue;
    const sum = round2(percents.reduce((total, child) => total + child.percent!, 0));
    if (Math.abs(sum - 100) > EPSILON) percentSplits.push({ code: node.code, rowNumber: node.rowNumber, percentSum: sum });
  }
  // totals, bottom up (a parent's total is the sum of its children; its own written amount is compared, not added)
  const totalOf = (node: BudgetNode): number | null => {
    if (!node.childCodes.length) { node.total = node.own; return node.total; }
    let sum = 0; let any = false;
    for (const code of node.childCodes) { const value = totalOf(nodes.get(code)!); if (value !== null) { sum += value; any = true; } }
    node.total = any ? round2(sum) : null;
    if (node.written !== null && node.total !== null && Math.abs(node.written - node.total) > EPSILON) {
      parentDifferences.push({ code: node.code, description: node.description, rowNumber: node.rowNumber, written: node.written, childrenSum: node.total, difference: round2(node.written - node.total) });
    }
    if (node.total === null && node.written !== null) node.total = node.written; // a parent with an amount and no amounts below it keeps its own
    return node.total;
  };
  const roots = Array.from(nodes.values()).filter(node => node.parentCode === null);
  for (const root of roots) totalOf(root);
  const list = Array.from(nodes.values());
  return {
    nodes: list,
    roots: roots.map(node => node.code),
    leaves: list.filter(node => !node.childCodes.length).length,
    total: round2(roots.reduce((sum, root) => sum + (root.total ?? 0), 0)),
    parentDifferences: parentDifferences.sort((a, b) => a.rowNumber - b.rowNumber),
    percentSplits,
    duplicates,
    withoutAmount,
  };
}
