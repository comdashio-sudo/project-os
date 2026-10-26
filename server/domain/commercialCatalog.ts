import type { ProductCode, SubscriptionPackageCode } from "../../drizzle/schema";
import { productsForPackage } from "./authorization";

// The plan catalogue the product ships with: seven plans (one per package) and the features each package unlocks. It is catalogue data, not company data -- no company, user,
// project or price. Two things read it: the server (db.ts ensureDefaultCommercialCatalog, the fallback when the catalogue is empty) and the launch button (scripts/bootstrap/run.ts
// `catalog`, which plants it in production so the first person to open the sign-up screen finds the plans already there).
export const defaultCommercialPlans = [
  { code: "EXECUTIVE_STANDARD", name: "Executive Standard", packageCode: "EXECUTIVE" as SubscriptionPackageCode },
  { code: "PMO_STANDARD", name: "PMO Standard", packageCode: "PMO" as SubscriptionPackageCode },
  { code: "PROJECT_STANDARD", name: "Project Standard", packageCode: "PROJECT" as SubscriptionPackageCode },
  { code: "EXECUTIVE_PMO_STANDARD", name: "Executive + PMO Standard", packageCode: "EXECUTIVE + PMO" as SubscriptionPackageCode },
  { code: "PMO_PROJECT_STANDARD", name: "PMO + Project Standard", packageCode: "PMO + PROJECT" as SubscriptionPackageCode },
  { code: "EXECUTIVE_PROJECT_STANDARD", name: "Executive + Project Standard", packageCode: "EXECUTIVE + PROJECT" as SubscriptionPackageCode },
  { code: "ALL_IN_ONE_STANDARD", name: "All-In-One Standard", packageCode: "ALL-IN-ONE" as SubscriptionPackageCode },
] as const;

export const defaultCommercialFeatures = [
  { code: "MASTER_PLAN", name: "Master Plan", productCode: "PROJECT" as ProductCode },
  { code: "MASTER_PLAN_ENTITIES", name: "Master Plan spatial entities", productCode: "PROJECT" as ProductCode },
  { code: "DATA_IMPORT", name: "Data import", productCode: "PROJECT" as ProductCode },
  { code: "DATA_EXPORT", name: "Data export", productCode: "PROJECT" as ProductCode },
  { code: "PROJECT_LIMIT", name: "Project limit", productCode: "PROJECT" as ProductCode },
  { code: "STORAGE_BYTES", name: "Document storage bytes", productCode: "PROJECT" as ProductCode },
  { code: "PMC", name: "Project control (PMC)", productCode: "PROJECT" as ProductCode },
  { code: "AI_ADVISORY_MONTHLY", name: "Monthly AI advisory requests", productCode: "PROJECT" as ProductCode },
] as const;

/** Which feature each plan carries: a feature belongs to every plan whose package includes the feature's product. */
export const defaultPlanFeaturePairs = () =>
  defaultCommercialPlans.flatMap(plan => defaultCommercialFeatures.filter(feature => productsForPackage(plan.packageCode).includes(feature.productCode)).map(feature => ({ planCode: plan.code, featureCode: feature.code })));
