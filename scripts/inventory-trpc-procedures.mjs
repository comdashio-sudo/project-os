import { readFile } from "node:fs/promises";
import { appRouter } from "../server/routers.ts";

const allowedFrameworkExceptions = new Map([
  ["access.check", "فحص إطار الوصول العام؛ تغطيه حراسة tRPC واختبارات الواجهة."],
  ["auth.me", "قراءة جلسة OAuth؛ تغطيها طبقة المصادقة لا قاعدة أعمال."],
  ["auth.logout", "إلغاء جلسة؛ له اختبار وحدة مستقل لمسح ملف الارتباط."],
  ["system.health", "فحص مراقبة عام بلا نطاق أعمال أو كتابة."],
]);
const validate = process.argv.includes("--validate");

const procedures = Object.entries(appRouter._def.procedures)
  .map(([path, procedure]) => ({
    path,
    type: procedure._def.type,
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

const integrationSources = await Promise.all([
  readFile(new URL("../server/integration.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/commercial_chain.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/profitability.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/fieldEntry.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/pmc.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/pmc.import.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/pmc.screens.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/pmc.plan.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/pmc.programme.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/operational.permissions.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/labour.cost.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/cashflow.drill.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/teamhours.offline.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/stock.valuation.database.test.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/payroll.allocation.database.test.ts", import.meta.url), "utf8"),
]);
const integrationSource = integrationSources.join("\n");
const procedurePaths = new Set(procedures.map(({ path }) => path));
const references = new Set();
for (const path of procedurePaths) {
  const escapedPath = path.replaceAll(".", "\\.");
  const expression = new RegExp(`\\b[A-Za-z_$][A-Za-z0-9_$]*(?:\\.${escapedPath})\\s*\\(`, "g");
  const callerExpression = new RegExp(`createCaller\\([^)]*\\)(?:\\.${escapedPath})\\s*\\(`, "g");
  if (expression.test(integrationSource) || callerExpression.test(integrationSource)) references.add(path);
}

const directIntegrationProcedures = procedures.filter(({ path }) => references.has(path));
const proceduresWithoutDirectReference = procedures.filter(({ path }) => !references.has(path));
const unclassifiedProcedures = proceduresWithoutDirectReference.filter(({ path }) => !allowedFrameworkExceptions.has(path));
const staleExceptions = [...allowedFrameworkExceptions.keys()].filter((path) => !procedurePaths.has(path));

console.log(JSON.stringify({
  procedureCount: procedures.length,
  directIntegrationReferenceCount: directIntegrationProcedures.length,
  procedures,
  directIntegrationProcedures,
  proceduresWithoutDirectReference,
  allowedFrameworkExceptions: Object.fromEntries(allowedFrameworkExceptions),
  unclassifiedProcedures,
  staleExceptions,
}, null, 2));

if (validate && (unclassifiedProcedures.length > 0 || staleExceptions.length > 0)) {
  console.error(`tRPC coverage validation failed: ${unclassifiedProcedures.length} unclassified procedure(s), ${staleExceptions.length} stale exception(s).`);
  process.exitCode = 1;
}
