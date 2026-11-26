// Q-64: the work structure as a tree, not a flat list of every item. A project imported from a P6 file has over a thousand nodes; the planner opens the first level,
// reads each node's children, activities and dates, searches by code or name, and opens only what they need. Pure functions (no screen): the tree, the totals of
// each node over everything below it, the search and the rows that are visible.

export type WbsItem = { id: string; code: string; name: string; parentId?: string | null; plannedValue?: string | number | null; progressPercent?: string | number | null };
export type WbsActivity = { wbsItemId?: string | null; plannedStartAt?: Date | string | null; plannedFinishAt?: Date | string | null };

export type WbsNode = {
  item: WbsItem;
  children: WbsNode[];
  /** activities of this node and of everything below it */
  activities: number;
  /** the earliest start and the latest finish over those activities (ISO date, null when none has one) */
  start: string | null;
  finish: string | null;
};

const day = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const earlier = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a < b ? a : b);
const later = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a > b ? a : b);

/** The roots: items with no parent, or whose parent is not in the list (a node whose parent is missing is shown, never lost). A cycle in the data cannot hang the build. */
export function buildWbsTree(items: readonly WbsItem[], activities: readonly WbsActivity[]): WbsNode[] {
  const own = new Map<string, { count: number; start: string | null; finish: string | null }>();
  for (const activity of activities) {
    if (!activity.wbsItemId) continue;
    const entry = own.get(activity.wbsItemId) ?? { count: 0, start: null, finish: null };
    entry.count += 1; entry.start = earlier(entry.start, day(activity.plannedStartAt)); entry.finish = later(entry.finish, day(activity.plannedFinishAt));
    own.set(activity.wbsItemId, entry);
  }
  const byId = new Map(items.map(item => [item.id, item]));
  const childrenOf = new Map<string, WbsItem[]>();
  const roots: WbsItem[] = [];
  for (const item of items) {
    const parent = item.parentId && item.parentId !== item.id && byId.has(item.parentId) ? item.parentId : null;
    if (parent === null) roots.push(item); else (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(item);
  }
  const byCode = (a: WbsItem, b: WbsItem) => a.code.localeCompare(b.code, "en", { numeric: true });
  const seen = new Set<string>();
  // recursive, as deep as the tree is (a P6 tree is a few levels): a node is built once (`seen`), so a cycle in the data cannot loop
  const build = (item: WbsItem): WbsNode => {
    seen.add(item.id);
    const children = (childrenOf.get(item.id) ?? []).filter(child => !seen.has(child.id)).sort(byCode).map(build);
    const mine = own.get(item.id);
    let activitiesCount = mine?.count ?? 0; let start = mine?.start ?? null; let finish = mine?.finish ?? null;
    for (const child of children) { activitiesCount += child.activities; start = earlier(start, child.start); finish = later(finish, child.finish); }
    return { item, children, activities: activitiesCount, start, finish };
  };
  return roots.sort(byCode).map(build);
}

const normal = (text: string) => text.normalize("NFKC").toLowerCase().trim();

/** What a search leaves: the nodes whose code or name holds the text, and the ancestors that lead to them. Empty text leaves everything. */
export function searchWbsTree(roots: readonly WbsNode[], query: string): { visible: Set<string> | null; matches: number } {
  const needle = normal(query);
  if (!needle) return { visible: null, matches: 0 };
  const visible = new Set<string>(); let matches = 0;
  const walk = (node: WbsNode): boolean => {
    const hit = normal(node.item.code).includes(needle) || normal(node.item.name).includes(needle);
    let below = false;
    for (const child of node.children) if (walk(child)) below = true;
    if (hit) matches += 1;
    if (hit || below) visible.add(node.item.id);
    return hit || below;
  };
  for (const root of roots) walk(root);
  return { visible, matches };
}

export type WbsRow = { node: WbsNode; depth: number; open: boolean };

/**
 * The rows to draw, top to bottom. `open` is the set of nodes the person opened; the first level is open until they say otherwise (`firstLevelOpen`). While searching, every
 * ancestor of a match is open so the match is seen, and only the nodes the search kept are drawn.
 */
export function visibleWbsRows(roots: readonly WbsNode[], options: { open: ReadonlySet<string>; closed?: ReadonlySet<string>; visible: ReadonlySet<string> | null; firstLevelOpen?: boolean }): WbsRow[] {
  const rows: WbsRow[] = [];
  const walk = (node: WbsNode, depth: number) => {
    if (options.visible && !options.visible.has(node.item.id)) return;
    const hasChildren = node.children.some(child => !options.visible || options.visible.has(child.item.id));
    const wanted = options.visible ? !options.closed?.has(node.item.id) : options.open.has(node.item.id) || (depth === 0 && Boolean(options.firstLevelOpen) && !options.closed?.has(node.item.id));
    const open = hasChildren && wanted;
    rows.push({ node, depth, open });
    if (open) for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return rows;
}
