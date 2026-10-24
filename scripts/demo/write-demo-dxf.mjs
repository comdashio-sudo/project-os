// Writes docs/demo/master-plan-demo.dxf: the demonstration company's site drawing (25 blocks, 500 villas, one number inside each), for uploading in the Master Plan
// screen. The same layout the seed gives every unit's polygon, so what the screen links from the drawing is what the seed already shows.
import { mkdirSync, writeFileSync } from "node:fs";
import { demoDxf } from "./demoData.ts";
mkdirSync("docs/demo", { recursive: true });
writeFileSync("docs/demo/master-plan-demo.dxf", demoDxf());
console.log(JSON.stringify({ wrote: "docs/demo/master-plan-demo.dxf" }));
