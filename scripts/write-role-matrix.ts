// Rewrites the table between the markers of docs/ROLE_MATRIX.md from the code (server/domain/roleMatrix.ts). `pnpm exec tsx scripts/write-role-matrix.ts`
// The test (server/domain/roleMatrix.test.ts) fails whenever the document differs from what this prints, so a change to a role template or a server check
// is never silent: regenerate, read the diff, and let the owner decide.
import { readFileSync, writeFileSync } from "node:fs";
import { renderRoleMatrix, renderSensitiveSummary, renderViewerAdditions } from "../server/domain/roleMatrix";

const file = new URL("../docs/ROLE_MATRIX.md", import.meta.url);
let text = readFileSync(file, "utf8");
const swap = (name: string, body: string) => {
  const re = new RegExp(`(<!-- ${name}:BEGIN -->\\n)[\\s\\S]*?(\\n<!-- ${name}:END -->)`);
  if (!re.test(text)) throw new Error(`markers ${name} not found in docs/ROLE_MATRIX.md`);
  text = text.replace(re, (_all, start, end) => `${start}${body}${end}`);
};
swap("ROLE_MATRIX", renderRoleMatrix());
swap("VIEWER_ADDITIONS", renderViewerAdditions());
swap("SENSITIVE", renderSensitiveSummary());
writeFileSync(file, text);
