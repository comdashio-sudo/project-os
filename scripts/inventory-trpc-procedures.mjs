import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRouter } from "../server/routers.ts";

const allowedFrameworkExceptions = new Map([
  ["access.check", "فحص إطار الوصول العام؛ تغطيه حراسة tRPC واختبارات الواجهة."],
  ["auth.me", "قراءة جلسة OAuth؛ تغطيها طبقة المصادقة لا قاعدة أعمال."],
  ["auth.logout", "إلغاء جلسة في الخادم ثم مسح ملف الارتباط؛ اختبار وحدة مستقل واختبار حي في auth.session.database.test.ts."],
  ["auth.logoutEverywhere", "إنهاء كل جلسات المستخدم؛ اختبار حي في auth.session.database.test.ts (يتحقق أن كل نسخ ملف الارتباط تموت)."],
  ["system.health", "فحص مراقبة عام بلا نطاق أعمال أو كتابة."],
  ["mfa.verify", "الخطوة الثانية (MFA) أُزيلت من الدخول (D-81) والإجراء باقٍ لمن فعّلها؛ منطقه verifySecondStep مختبَر مباشرة على القاعدة في mfa.database.test.ts (الرمز الصحيح، ومنع إعادة الاستعمال في جلسة أخرى، والقفل)."],
]);
const validate = process.argv.includes("--validate");

const procedures = Object.entries(appRouter._def.procedures)
  .map(([path, procedure]) => ({
    path,
    type: procedure._def.type,
  }))
  .concat(process.env.TRPC_COVERAGE_EXTRA_PROCEDURE ? [{ path: process.env.TRPC_COVERAGE_EXTRA_PROCEDURE, type: "query" }] : [])
  .sort((left, right) => left.path.localeCompare(right.path));

// D-17: every database test of the server counts (a hand-kept list of files fell behind: 62, then 82 procedures read as «unclassified» although tested).
// TRPC_COVERAGE_EXTRA_PROCEDURE names a procedure that does not exist in the router, to prove the check fails on an unclassified one (server/trpcCoverage.test.ts).
const testFiles = [];
const walk = async dir => { for (const entry of await readdir(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) await walk(full); else if (entry.name.endsWith(".database.test.ts")) testFiles.push(full); } };
await walk(fileURLToPath(new URL("../server/", import.meta.url)));
const integrationSources = await Promise.all(testFiles.sort().map(file => readFile(file, "utf8")));
const integrationSource = integrationSources.join("\n");
const procedurePaths = new Set(procedures.map(({ path }) => path));
const references = new Set();
for (const path of procedurePaths) {
  const escapedPath = path.replaceAll(".", "\\.");
  // `caller.x.y(`, and also `manager().x.y(` / `callers[key].x.y(` (a call or an index before the path)
  const expression = new RegExp(`(?:\\b[A-Za-z_$][A-Za-z0-9_$]*|[)\\]])\\.${escapedPath}\\s*\\(`, "g");
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
