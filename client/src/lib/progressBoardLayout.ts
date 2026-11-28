// Q-63 (batch 1): the progress board's map when no drawing is linked — never an empty screen. Each block is a labelled group, its villas a grid of
// squares in number order; the blocks flow left to right and wrap. Pure: the canvas draws what this returns, and a tap finds its villa here.

export type BoardUnit = { unitNumber: number; blockCode: string; modelCode: string; progressPercent: number | null; thisMonthPercent: number | null };
export type Cell = { unitNumber: number; x: number; y: number; size: number };
export type BlockBox = { blockCode: string; x: number; y: number; width: number; height: number };
export type Layout = { cells: Cell[]; blocks: BlockBox[]; width: number; height: number };

const LABEL = 18;
const GAP = 12;

/** Lays the villas out in `width` pixels: blocks in code order (numeric-aware), villas in number order, `size` px squares with a 2 px gap. */
export function schematicLayout(units: BoardUnit[], width: number, size = 14): Layout {
  const byBlock = new Map<string, BoardUnit[]>();
  for (const unit of units) byBlock.set(unit.blockCode, [...(byBlock.get(unit.blockCode) ?? []), unit]);
  const blocks = Array.from(byBlock.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const step = size + 2;
  const cells: Cell[] = []; const boxes: BlockBox[] = [];
  let x = 0; let y = 0; let rowHeight = 0;
  for (const code of blocks) {
    const list = byBlock.get(code)!.slice().sort((a, b) => a.unitNumber - b.unitNumber);
    // a block is about square, never wider than the map
    const columns = Math.max(1, Math.min(Math.ceil(Math.sqrt(list.length)), Math.floor(width / step)));
    const blockWidth = columns * step; const blockHeight = LABEL + Math.ceil(list.length / columns) * step;
    if (x > 0 && x + blockWidth > width) { x = 0; y += rowHeight + GAP; rowHeight = 0; }
    boxes.push({ blockCode: code, x, y, width: blockWidth, height: blockHeight });
    list.forEach((unit, index) => cells.push({ unitNumber: unit.unitNumber, x: x + (index % columns) * step, y: y + LABEL + Math.floor(index / columns) * step, size }));
    x += blockWidth + GAP; rowHeight = Math.max(rowHeight, blockHeight);
  }
  return { cells, blocks: boxes, width, height: y + rowHeight };
}

/** The villa under a point of the map, or null (a gap, a label, outside). */
export function cellAt(layout: Layout, px: number, py: number): number | null {
  const hit = layout.cells.find(cell => px >= cell.x && px < cell.x + cell.size && py >= cell.y && py < cell.y + cell.size);
  return hit ? hit.unitNumber : null;
}

export type ColourMode = "progress" | "month" | "model";

/**
 * The band a villa falls in for a colouring; the canvas maps a band to a theme colour. "unknown" is a villa whose progress the PMC cannot say (no
 * activities for its model) — drawn as unknown, never as 0.
 */
export function bandOf(unit: BoardUnit, mode: ColourMode, models: string[]): string {
  if (mode === "model") return `model:${Math.max(models.indexOf(unit.modelCode), 0) % 5}`;
  const value = mode === "progress" ? unit.progressPercent : unit.thisMonthPercent;
  if (value === null) return "unknown";
  if (mode === "month") return value <= 0 ? "none" : value < 5 ? "low" : value < 15 ? "mid" : "high";
  return value >= 100 ? "done" : value <= 0 ? "none" : value < 34 ? "low" : value < 67 ? "mid" : "high";
}
