// Q-65: «التكلفة» — the project's budget as a tree by cost code on the planning page. The lines are the leaves (a hierarchical budget import writes only them); each parent
// shows the sum of the leaves below it, so nothing is counted twice and the project total is the leaves once. Read from the controls the page already holds, which answer
// no budget at all to someone who may not see the project's money — then this section is not drawn.
import React from "react";
import { Card, CardBody, CardHeader, CardTitle, DataTable, type Column } from "@/components/ds";
import { formatAmount, formatNumber } from "@/components/ds/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { budgetByCode, type BudgetTreeRow } from "@/lib/budgetByCode";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: { title: "التكلفة بحسب الرمز", note: "الأوراق هي ما استُورد؛ كل أب مجموع أوراقه، فلا يُحسب مبلغ مرتين.", code: "الرمز", original: "الأصلية", current: "الحالية", leaves: "البنود", activity: "رقم النشاط", total: "إجمالي المشروع" },
  en: { title: "Cost by code", note: "The leaves are what was imported; each parent is the sum of its leaves, so nothing is counted twice.", code: "Code", original: "Original", current: "Current", leaves: "Lines", activity: "Activity No.", total: "Project total" },
  ur: { title: "کوڈ کے مطابق لاگت", note: "پتے وہی ہیں جو درآمد ہوئے؛ ہر والد اپنے پتوں کا مجموعہ ہے، اس لیے کوئی رقم دو بار شمار نہیں ہوتی۔", code: "کوڈ", original: "اصل", current: "موجودہ", leaves: "اندراجات", activity: "سرگرمی نمبر", total: "منصوبے کا کل" },
};

export function BudgetTreeSection({ budgets, currency }: { budgets: ReadonlyArray<{ costCode: string; originalAmount: string | number; currentAmount: string | number; activityNo?: string | null }>; currency: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  if (!budgets.length) return null;
  const unit = currency === "SAR" ? pickLanguage(language, { ar: "ريال", en: "SAR", ur: "ریال" }) : currency; // the base currency in the reader's language, as the rest of the platform says it
  const { rows, total } = budgetByCode(budgets.map(line => ({ costCode: line.costCode, originalAmount: Number(line.originalAmount), currentAmount: Number(line.currentAmount), activityNo: line.activityNo })));
  const columns: Column<BudgetTreeRow>[] = [
    { key: "code", header: t.code, render: row => <span className="whitespace-nowrap" style={{ paddingInlineStart: `${row.depth * 12}px` }}><bdi dir="ltr" className={row.leaf ? "" : "font-semibold"}>{row.code}</bdi></span> },
    { key: "activity", header: t.activity, render: row => (row.activityNo ? <bdi dir="ltr" className="whitespace-nowrap">{row.activityNo}</bdi> : "") },
    { key: "leaves", header: t.leaves, numeric: true, render: row => (row.leaf ? "" : formatNumber(row.leaves)) },
    { key: "original", header: `${t.original} (${unit})`, numeric: true, render: row => <bdi dir="ltr" className={row.leaf ? "" : "font-semibold"}>{formatAmount(row.original)}</bdi> },
    { key: "current", header: `${t.current} (${unit})`, numeric: true, render: row => <bdi dir="ltr" className={row.leaf ? "" : "font-semibold"}>{formatAmount(row.current)}</bdi> },
  ];
  return (
    <Card data-budget-tree>
      <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
      <CardBody>
        <p className="mb-2 text-xs text-muted-foreground">{t.note}</p>
        <p className="mb-2 text-sm" data-budget-tree-total>{t.total}: <bdi dir="ltr">{formatAmount(total.current)} {unit}</bdi></p>
        <DataTable caption={t.title} columns={columns} rows={rows} rowKey={row => row.code} />
      </CardBody>
    </Card>
  );
}
