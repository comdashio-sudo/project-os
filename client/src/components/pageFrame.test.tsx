import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every screen that sits inside the product frame (App.tsx wraps each company route except /m/* and /setup/*) draws its root and top row through
// PageMain and PageHeader, so the frame keeps the one <main> and the one banner (code review of #156, item 2). A literal <main> or <header>
// in one of these files would bring the second bar back.
const FRAMED_SOURCES = [
  "pages/ExecutiveDashboard.tsx", "pages/PmoDashboard.tsx", "pages/LicensingConsole.tsx", "pages/BillingRegister.tsx", "pages/SupportCenter.tsx",
  "pages/EmployeeRegistry.tsx", "pages/PayrollWorkspace.tsx", "pages/TenantAdministration.tsx", "pages/MyPerformance.tsx", "pages/ProjectControls.tsx",
  "pages/CommercialChain.tsx", "pages/ProjectProfitability.tsx", "pages/ProjectPmc.tsx", "pages/ProjectRegistry.tsx", "pages/UserGuide.tsx",
  "components/LevelDashboard.tsx", "components/FieldShell.tsx",
];

describe("framed screens draw no landmark of their own", () => {
  for (const file of FRAMED_SOURCES) {
    it(file, () => {
      const source = readFileSync(path.join(__dirname, "..", file), "utf8");
      expect(source).not.toMatch(/<main[\s>]/);
      expect(source).not.toMatch(/<header[\s>]/);
    });
  }
});
