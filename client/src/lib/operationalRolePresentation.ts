const operationalRoleNames = {
  WAREHOUSE_CUSTODIAN: { ar: "أمين المستودع", en: "Warehouse Custodian" },
  PROCUREMENT_OFFICER: { ar: "مسؤول المشتريات والتوريد", en: "Procurement Officer" },
  FINANCE_MANAGER: { ar: "المدير المالي", en: "Finance Manager" },
  ACCOUNTANT: { ar: "المحاسب", en: "Accountant" },
  HR_MANAGER: { ar: "مدير الموارد البشرية", en: "HR Manager" },
  PLANNING_ENGINEER: { ar: "مهندس التخطيط", en: "Planning Engineer" },
  SITE_ENGINEER: { ar: "مهندس الموقع", en: "Site Engineer" },
  PROJECT_MANAGER: { ar: "مدير المشروع", en: "Project Manager" },
} as const;

export function getOperationalRoleName(role: { code: string; name: string }, isArabic: boolean) {
  const localized = operationalRoleNames[role.code as keyof typeof operationalRoleNames];
  return localized ? (isArabic ? localized.ar : localized.en) : role.name;
}
