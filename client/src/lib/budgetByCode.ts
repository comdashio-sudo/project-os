// Q-65: the project's budget as a tree by cost code. The budget lines hold the LEAVES (a hierarchical import writes only them, so nothing is counted twice); the parents
// are the codes' own prefixes cut at a separator (GC.26037-000.03.01 → GC.26037-000.03 → GC.26037-000 → GC.26037), each carrying the sum of the leaves below it. Pure:
// no query, nothing is invented — a parent's total is only what its leaves add up to.
export type BudgetLineInput = { costCode: string; originalAmount: number; currentAmount: number };
export type BudgetTreeRow = { code: string; depth: number; leaf: boolean; original: number; current: number; leaves: number };

const SEPARATOR = /[.\-/]/;
/** The prefixes of a code that end before a separator, shortest first (the code itself is not among them). */
export function ancestorsOf(code: string): string[] {
  const found: string[] = [];
  for (let index = 1; index < code.length; index++) if (SEPARATOR.test(code[index])) found.push(code.slice(0, index));
  return found;
}

export function budgetByCode(lines: readonly BudgetLineInput[]): { rows: BudgetTreeRow[]; total: { original: number; current: number } } {
  const codes = new Set(lines.map(line => line.costCode));
  const nodes = new Map<string, { original: number; current: number; leaves: number; leaf: boolean }>();
  const touch = (code: string, leaf: boolean) => { if (!nodes.has(code)) nodes.set(code, { original: 0, current: 0, leaves: 0, leaf }); return nodes.get(code)!; };
  for (const line of lines) {
    const own = touch(line.costCode, true);
    own.original += line.originalAmount; own.current += line.currentAmount; own.leaves += 1;
    for (const ancestor of ancestorsOf(line.costCode)) {
      // an ancestor that is itself a line of the budget (a parent written as its own line) is a leaf with its own amount, not a group
      const node = touch(ancestor, codes.has(ancestor));
      if (!codes.has(ancestor)) { node.original += line.originalAmount; node.current += line.currentAmount; node.leaves += 1; }
    }
  }
  const sorted = Array.from(nodes.keys()).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const rows = sorted.map(code => { const node = nodes.get(code)!; return { code, depth: ancestorsOf(code).filter(ancestor => nodes.has(ancestor)).length, leaf: node.leaf, original: round2(node.original), current: round2(node.current), leaves: node.leaves }; });
  return { rows, total: { original: round2(lines.reduce((sum, line) => sum + line.originalAmount, 0)), current: round2(lines.reduce((sum, line) => sum + line.currentAmount, 0)) } };
}
