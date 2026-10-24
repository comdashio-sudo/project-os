import React from "react";
import { Link, useParams, useSearch } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingState } from "@/components/ScreenStates";
import { LevelDashboard, LevelSection, formatMoney } from "@/components/LevelDashboard";
import { SourceNotice } from "@/components/SectionResilience";
import { Figure } from "@/pages/LevelCompany";
import { type ScopeLevels, levelHref } from "@/lib/levels";
import { enumLabel } from "@/lib/labels";

// Level 4, one project warehouse: balance, movements, shortages and the materials not yet approved. The balance, movements and shortages
// come from `scopes.warehouse` (scopeDashboards.ts). The warehouse is chosen from the project's own list (`warehouses.list`) by the
// `?warehouse=` parameter; the first one is shown when none is named. This is the lowest level: nothing lies below it.

const text = {
  ar: {
    loading: "جارٍ تحميل المستودع…", noWarehouse: "لا مستودع لهذا المشروع بعد.", noWarehouseBody: "أنشئ مستودعًا من شاشة المستودعات في المشروع ليظهر هنا.",
    balance: "الرصيد", materials: "المواد", stockValue: "قيمة المخزون (بعملة المشروع)", belowReorder: "دون حد الطلب",
    code: "الرمز", description: "الوصف", quantity: "الكمية", unit: "الوحدة", value: "القيمة", reorder: "حد الطلب",
    movements: "الحركات", date: "التاريخ", type: "النوع", reference: "المرجع", noMovements: "لا حركات بعد في هذا المستودع.",
    shortages: "النواقص", noShortage: "لا نواقص: كل مادة فوق حد طلبها.", belowLine: "أقل من حد الطلب",
    unapproved: "مواد غير معتمدة", unapprovedFailed: "تعذّر تحميل المواد غير المعتمدة.", held: "مواد بها رصيد", unapprovedCount: "غير معتمدة", allApproved: "كل المواد المحجوزة في هذا المستودع معتمدة.", noSubmittal: "لم يُقدَّم اعتماد", notApproved: "لم تُعتمد",
    chooser: "المستودعات", current: "المعروض الآن", lowest: "أدنى مستوى: لا مستوى تحته.",
    title: "لوحة المستودع",
  },
  en: {
    loading: "Loading the warehouse…", noWarehouse: "This project has no warehouse yet.", noWarehouseBody: "Create a warehouse on the project's warehouse screen and it appears here.",
    balance: "Balance", materials: "Materials", stockValue: "Stock value (project currency)", belowReorder: "Below reorder level",
    code: "Code", description: "Description", quantity: "Quantity", unit: "Unit", value: "Value", reorder: "Reorder level",
    movements: "Movements", date: "Date", type: "Type", reference: "Reference", noMovements: "No movements yet in this warehouse.",
    shortages: "Shortages", noShortage: "No shortages: every material is above its reorder level.", belowLine: "Below reorder level",
    unapproved: "Unapproved materials", unapprovedFailed: "Could not load the unapproved materials.", held: "Materials on hand", unapprovedCount: "Unapproved", allApproved: "Every material on hand in this warehouse is approved.", noSubmittal: "No approval submitted", notApproved: "Not approved",
    chooser: "Warehouses", current: "Shown now", lowest: "This is the lowest level.",
    title: "Warehouse dashboard",
  },
  ur: {
    loading: "گودام لوڈ ہو رہا ہے…", noWarehouse: "اس پروجیکٹ کا ابھی کوئی گودام نہیں ہے۔", noWarehouseBody: "پروجیکٹ کی گودام کی اسکرین پر گودام بنائیں، پھر وہ یہاں ظاہر ہوگا۔",
    balance: "بقایا", materials: "مواد", stockValue: "اسٹاک کی قیمت (پروجیکٹ کی کرنسی)", belowReorder: "دوبارہ آرڈر کی سطح سے نیچے",
    code: "کوڈ", description: "تفصیل", quantity: "مقدار", unit: "اکائی", value: "قدر", reorder: "دوبارہ آرڈر کی سطح",
    movements: "حرکات", date: "تاریخ", type: "قسم", reference: "حوالہ", noMovements: "اس گودام میں ابھی تک کوئی حرکت نہیں ہوئی۔",
    shortages: "کمی", noShortage: "کوئی کمی نہیں: ہر مواد دوبارہ آرڈر کی سطح سے اوپر ہے۔", belowLine: "دوبارہ آرڈر کی سطح سے نیچے",
    unapproved: "غیر منظور شدہ مواد", unapprovedFailed: "غیر منظور شدہ مواد لوڈ نہیں ہو سکا۔", held: "موجود مواد", unapprovedCount: "غیر منظور شدہ", allApproved: "اس گودام میں موجود ہر مواد منظور شدہ ہے۔", noSubmittal: "کوئی منظوری جمع نہیں کرائی گئی", notApproved: "منظور نہیں",
    chooser: "گودام", current: "ابھی دکھایا جا رہا ہے", lowest: "یہ سب سے نچلی سطح ہے۔",
    title: "گودام کا ڈیش بورڈ",
  },
};

export default function LevelWarehouse() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const search = useSearch();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const enabled = Boolean(tenantId && projectId);
  // The level's own list (levelReads.projectWarehouses): `warehouses.list` needs project.read, which a warehouse keeper does not hold.
  const list = trpc.levelReads.projectWarehouses.useQuery({ tenantId, projectId }, { enabled });
  const warehouses = list.data?.warehouses ?? [];
  const requested = new URLSearchParams(search).get("warehouse");
  const chosen = warehouses.find(item => item.id === requested) ?? warehouses.find(item => item.active) ?? warehouses[0];
  const stock = trpc.scopes.warehouse.useQuery({ tenantId, projectId, warehouseId: chosen?.id ?? "" }, { enabled: enabled && Boolean(chosen) });
  const unapproved = trpc.levelReads.warehouseUnapprovedMaterials.useQuery({ tenantId, projectId, warehouseId: chosen?.id ?? "" }, { enabled: enabled && Boolean(chosen) });
  const title = stock.data ? `${stock.data.warehouse.code} · ${stock.data.warehouse.name}` : t.title;
  const dashboard = (body: React.ReactNode) => <LevelDashboard level="warehouse" tenantId={tenantId} projectId={projectId} title={title}>{body}</LevelDashboard>;
  if (list.isLoading || (chosen && stock.isLoading)) return dashboard(<LoadingState isArabic={isArabic} label={t.loading} />);
  if (list.error) return dashboard(<ErrorState isArabic={isArabic} error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} />);
  if (!chosen) return dashboard(<EmptyState isArabic={isArabic} title={t.noWarehouse} body={t.noWarehouseBody} />);
  if (stock.error || !stock.data) return dashboard(<>
    {warehouses.length > 1 && <Chooser warehouses={warehouses} tenantId={tenantId} projectId={projectId} currentId={chosen.id} t={t} />}
    <ErrorState isArabic={isArabic} error={stock.error} onRetry={() => stock.refetch()} retrying={stock.isFetching} />
  </>);
  const data: ScopeLevels["warehouse"] = stock.data;
  const shortages = data.stock.filter(line => line.belowReorder);
  const amount = (value: number) => formatMoney(value, null);
  return dashboard(<>
    {warehouses.length > 1 && <Chooser warehouses={warehouses} tenantId={tenantId} projectId={projectId} currentId={chosen.id} t={t} />}
    <LevelSection id="warehouse-balance" title={t.balance}>
      <dl className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Figure label={t.materials} value={String(data.totals.materials)} />
        <Figure label={t.stockValue} value={amount(data.totals.stockValue)} />
        <Figure label={t.belowReorder} value={String(data.totals.materialsBelowReorder)} />
      </dl>
      {data.stock.length === 0 ? <p className="text-sm text-slate-600">{t.noMovements}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-slate-600"><tr><th scope="col" className="py-2 text-start">{t.code}</th><th scope="col" className="py-2 text-start">{t.description}</th><th scope="col" className="py-2 text-start">{t.quantity}</th><th scope="col" className="py-2 text-start">{t.unit}</th><th scope="col" className="py-2 text-start">{t.value}</th><th scope="col" className="py-2 text-start">{t.reorder}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{data.stock.map(line => <tr key={line.materialId} data-material-row={line.materialId} className={line.belowReorder ? "bg-amber-50" : undefined}>
          <th scope="row" className="py-3 text-start font-medium">{line.code}</th><td className="py-3">{line.description}</td><td className="py-3">{line.quantity}</td><td className="py-3">{line.unit}</td><td className="py-3">{amount(line.value)}</td><td className="py-3">{line.reorderLevel ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    </LevelSection>
    <LevelSection id="warehouse-movements" title={t.movements}>
      {data.recentMovements.length === 0 ? <p className="text-sm text-slate-600">{t.noMovements}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
        <thead className="text-xs text-slate-600"><tr><th scope="col" className="py-2 text-start">{t.date}</th><th scope="col" className="py-2 text-start">{t.type}</th><th scope="col" className="py-2 text-start">{t.quantity}</th><th scope="col" className="py-2 text-start">{t.reference}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{data.recentMovements.map(item => <tr key={item.id}>
          <td className="py-3">{new Intl.DateTimeFormat(pickLanguage(language, { ar: "ar", en: "en", ur: "ur-PK" }), { dateStyle: "medium" }).format(new Date(item.occurredAt))}</td><td className="py-3">{enumLabel(item.transactionType, language)}</td><td className="py-3">{item.quantityDelta}</td><td className="py-3">{item.referenceNumber ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    </LevelSection>
    <LevelSection id="warehouse-shortages" title={t.shortages}>
      {shortages.length === 0 ? <p className="text-sm text-slate-600">{t.noShortage}</p> : <ul className="space-y-2 text-sm">
        {shortages.map(line => <li key={line.materialId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-amber-50 p-3">
          <span className="font-medium">{line.code} · {line.description}</span>
          <span>{line.quantity} {line.unit} / {t.reorder} {line.reorderLevel} — {t.belowLine}</span>
        </li>)}
      </ul>}
    </LevelSection>
    <LevelSection id="warehouse-unapproved" title={t.unapproved}>
      <SourceNotice query={unapproved} isArabic={isArabic} title={t.unapproved} fallback={t.unapprovedFailed} />
      {unapproved.isLoading ? <LoadingState isArabic={isArabic} label={t.loading} />
        : unapproved.data ? <>
            <dl className="mb-4 grid grid-cols-2 gap-3">
              <Figure label={t.held} value={String(unapproved.data.stockedMaterials)} />
              <Figure label={t.unapprovedCount} value={String(unapproved.data.unapprovedCount)} />
            </dl>
            {unapproved.data.unapproved.length === 0 ? <p className="text-sm text-slate-600">{t.allApproved}</p> : <ul className="space-y-2 text-sm">
              {unapproved.data.unapproved.map(item => <li key={item.materialId} data-unapproved-material={item.materialId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-amber-50 p-3">
                <span className="font-medium">{item.code} · {item.description}</span>
                <span>{item.state === "no_submittal" ? t.noSubmittal : t.notApproved}</span>
              </li>)}
            </ul>}
          </>
        : null}
    </LevelSection>
  </>);
}

function Chooser({ warehouses, tenantId, projectId, currentId, t }: { warehouses: { id: string; code: string; name: string }[]; tenantId: string; projectId: string; currentId: string; t: typeof text.ar }) {
  const base = levelHref(tenantId, "warehouse", projectId);
  return <nav aria-label={t.chooser} className="flex flex-wrap gap-2">
    {warehouses.map(item => <Link key={item.id} href={`${base}?warehouse=${item.id}`} aria-current={item.id === currentId ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-slate-300 ${item.id === currentId ? "bg-[#0e6b70] text-white" : "bg-white text-slate-900"}`}>{item.code} · {item.name}</Link>)}
  </nav>;
}
