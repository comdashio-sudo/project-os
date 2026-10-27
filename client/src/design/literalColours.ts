// Work order 21: the only colours written as values. Everything a screen paints comes from the tokens in client/src/design/directions.css;
// these few are not paint but data or output that cannot read a CSS variable, so scripts/check-design-rules.mjs exempts this one module.

// A canvas and a PDF page have no CSS: the white the page is flattened onto before it is drawn or exported.
export const CANVAS_WHITE = "#ffffff";

// The master plan's visualization rules are saved per project and edited in a colour input, which takes #rrggbb only. These are the
// defaults a project starts from before it saves its own.
export const MASTER_PLAN_DEFAULT_RULE_COLOURS = {
  low: "#b91c1c",
  medium: "#b45309",
  high: "#047857",
  notStarted: "#475569",
} as const;
