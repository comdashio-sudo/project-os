/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { isLanguageNeutral, urduCopiesOf } from "./urduCopies";

// D-66 (D-12 a): the screens of this batch hold no Urdu text that is a copy of its English twin. A file joins the list when its batch is done
// (D-67 and D-68 add theirs), so a translated screen cannot slide back to English unnoticed.
const TRANSLATED = ["pages/ProjectPmc.tsx", "pages/ProjectMasterPlan.tsx", "pages/PmcSitePlan.tsx", "pages/PmcProgramme.tsx",
  // D-67: the level dashboards and the company administration
  "pages/ExecutiveDashboard.tsx", "pages/PmoDashboard.tsx", "pages/ProjectControls.tsx", "pages/TenantAdministration.tsx",
  // D-68 (batch 1): the demo-journey screens
  "pages/PayrollPanel.tsx", "pages/ProjectImports.tsx", "pages/ProjectDesign.tsx", "pages/ProjectFpac.tsx",
  // D-68 (batch 2): 19 screens translated now, and 27 whose Urdu was already written (their TRANSLATION_REVIEW row was stale)
  "components/DirectImportRunner.tsx",
  "components/EnterpriseNavigation.tsx",
  "components/ImportDiffPreview.tsx",
  "components/LevelDashboard.tsx",
  "components/MasterPlanTools.tsx",
  "components/OperationalRoleGuide.tsx",
  "components/PlanningControlCenter.tsx",
  "components/SectionResilience.tsx",
  "components/TenantDataCard.tsx",
  "lib/dxf/dxfReader.ts",
  "lib/excelExport.ts",
  "lib/indicatorBasis.ts",
  "lib/ledgerMessages.ts",
  "lib/levels.ts",
  "lib/operationalRolePresentation.ts",
  "lib/profitabilityView.ts",
  "lib/userGuide.ts",
  "pages/AcceptInvitation.tsx",
  "pages/BillingRegister.tsx",
  "pages/CashFlowMonthly.tsx",
  "pages/CommercialChain.tsx",
  "pages/EosLiabilityCard.tsx",
  "pages/EvmCalculator.tsx",
  "pages/FieldEntry.tsx",
  "pages/Home.tsx",
  "pages/LabourLoadingCard.tsx",
  "pages/LevelCompany.tsx",
  "pages/LevelEntry.tsx",
  "pages/LevelPortfolio.tsx",
  "pages/LevelProject.tsx",
  "pages/LevelWarehouse.tsx",
  "pages/LicensingConsole.tsx",
  "pages/NotFound.tsx",
  "pages/PayrollWorkspace.tsx",
  "pages/PmoControlLinks.tsx",
  "pages/PortfolioProfitability.tsx",
  "pages/ProjectAdvisor.tsx",
  "pages/ProjectDataExport.tsx",
  "pages/ProjectFieldReports.tsx",
  "pages/ProjectNotifications.tsx",
  "pages/ProjectQualityInspections.tsx",
  "pages/ProjectTenders.tsx",
  "pages/ProjectWorkforce.tsx",
  "pages/SetupWizard.tsx",
  "pages/SupportOwnerPanel.tsx",
  "pages/UserGuide.tsx",
  // D-68 (batch 3)
  "components/MasterPlanDrawing.tsx",
  "pages/ProjectChanges.tsx",
  "pages/ProjectHse.tsx",
  "pages/ProjectMaterials.tsx",
  "pages/ProjectResources.tsx",
  "pages/ProjectOperationalImports.tsx",
  "pages/ProjectInvoicesPanel.tsx",
  "pages/ProjectNcrs.tsx",
  "pages/ProjectRfis.tsx",
  "pages/ProjectClaims.tsx",
  "pages/MyPerformance.tsx",
  "pages/ProjectPurchaseOrders.tsx",
  "pages/ProjectGoodsReceipts.tsx",
  "pages/ProjectRegistry.tsx"];

// D-68 (closing): every source file under client/src, not only the batches above. A file that keeps English in its Urdu on purpose is named
// here with its reason; anything else with a copied Urdu text fails, so a new screen cannot arrive untranslated either.
const EXEMPT: Record<string, string> = {
  "components/dailyReport/DailyReportDocument.tsx": "Urdu takes the English headings, as the daily report's Excel export and the import templates do (STATE: declared limit)",
  "pages/ComponentShowcase.tsx": "the component gallery's sample data: date masks (MM, YYYY), initials, invoice codes, package and brand names",
  "pages/DesignPreview.tsx": "the English font sample shown in the English card, and the WCAG level name AA",
};
const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
});

describe("D-66: Urdu copies of English", () => {
  it("finds a copied Urdu text in a dictionary, in a nested `as Record` dictionary, and in an inline pick", () => {
    const source = `const t = { ar: { a: "أ" }, en: { title: "Plan", s: { x: "Open" } as Record<string, string>, f: (n: number) => \`\${n} units\` }, ur: { title: "Plan", s: { x: "Open" } as Record<string, string>, f: (n: number) => \`\${n} units\` } };
const p = pickLanguage(language, { ar: "حفظ", en: "Save", ur: "Save" });`;
    expect(urduCopiesOf(source).map(copy => copy.key).sort()).toEqual(["", "f", "s.x", "title"]);
  });

  it("D-68: finds a copied text inside an array value ([label, formula] pairs), and NEGATIVE: not a translated one", () => {
    const copied = `const t = { en: { rows: { cpi: ["Cost index", "EV ÷ AC"] } }, ur: { rows: { cpi: ["Cost index", "EV ÷ AC"] } } };`;
    expect(urduCopiesOf(copied).map(copy => copy.key)).toEqual(["rows.cpi[0]"]);
    const translated = `const t = { en: { rows: { cpi: ["Cost index", "EV ÷ AC"] } }, ur: { rows: { cpi: ["لاگت کا اشاریہ", "EV ÷ AC"] } } };`;
    expect(urduCopiesOf(translated)).toEqual([]);
  });

  it("D-68: an Urdu entry that names the English dictionary (`ur: enText`) is a whole copy; NEGATIVE: its own dictionary is not", () => {
    expect(urduCopiesOf(`const t = pickLanguage(language, { ar: arText, en: enText, ur: enText });`).map(copy => copy.key)).toEqual(["(whole)"]);
    expect(urduCopiesOf(`const t = pickLanguage(language, { ar: arText, en: enText, ur: urText });`)).toEqual([]);
  });

  it("NEGATIVE: a translated text, a glossary term kept in Latin, a number or a single letter is not a copy", () => {
    const source = `const t = { en: { title: "Plan", code: "WBS", ratio: "CPI / SPI", x: "X", n: "100" }, ur: { title: "پلان", code: "WBS", ratio: "CPI / SPI", x: "X", n: "100" } };`;
    expect(urduCopiesOf(source)).toEqual([]);
    expect(isLanguageNeutral("Export Excel")).toBe(false);
    expect(isLanguageNeutral("PMC · EVM")).toBe(true);
    // D-67: the product name "PROJECT OS" is a name, not a phrase; a real English phrase around it is still a copy
    expect(isLanguageNeutral("PROJECT OS")).toBe(true);
    expect(isLanguageNeutral("PROJECT MANAGER COMMAND CENTER")).toBe(false);
  });

  it.each(TRANSLATED)("%s has no Urdu text copied from English", file => {
    expect(urduCopiesOf(readFileSync(join(__dirname, "..", file), "utf8"), file)).toEqual([]);
  });

  it("D-68: no source file under client/src has an Urdu text copied from English, apart from the named exceptions", () => {
    const root = join(__dirname, "..");
    const copies = sourceFiles(root).map(path => relative(root, path)).filter(file => !(file in EXEMPT))
      .flatMap(file => urduCopiesOf(readFileSync(join(root, file), "utf8"), file).map(copy => `${file}:${copy.line} ${copy.key}`));
    expect(copies).toEqual([]);
  });

  it("NEGATIVE: each exception still has a copy (an exception that no longer needs it is removed)", () => {
    const root = join(__dirname, "..");
    for (const file of Object.keys(EXEMPT)) expect(urduCopiesOf(readFileSync(join(root, file), "utf8"), file).length, file).toBeGreaterThan(0);
  });
});
