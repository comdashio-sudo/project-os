import { readFile } from "node:fs/promises";
import { appRouter } from "../server/routers.ts";

const procedures = Object.entries(appRouter._def.procedures)
  .map(([path, procedure]) => ({
    path,
    type: procedure._def.type,
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

const integrationSource = await readFile(new URL("../server/integration.database.test.ts", import.meta.url), "utf8");
const procedurePaths = new Set(procedures.map(({ path }) => path));
const groups = [...new Set(procedures.map(({ path }) => path.split(".")[0]))].join("|");
const references = new Set();
const memberExpression = new RegExp(`\\b[A-Za-z_$][A-Za-z0-9_$]*\\.(${groups})\\.([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(`, "g");
const callerExpression = new RegExp(`createCaller\\([^)]*\\)\\.(${groups})\\.([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(`, "g");

for (const expression of [memberExpression, callerExpression]) {
  for (const match of integrationSource.matchAll(expression)) {
    const path = `${match[1]}.${match[2]}`;
    if (procedurePaths.has(path)) references.add(path);
  }
}

const directIntegrationProcedures = procedures.filter(({ path }) => references.has(path));
const proceduresWithoutDirectReference = procedures.filter(({ path }) => !references.has(path));

console.log(JSON.stringify({
  procedureCount: procedures.length,
  directIntegrationReferenceCount: directIntegrationProcedures.length,
  procedures,
  directIntegrationProcedures,
  proceduresWithoutDirectReference,
}, null, 2));
