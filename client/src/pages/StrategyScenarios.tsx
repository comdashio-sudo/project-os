import React, { useState } from "react";
import { formatAmount, formatNumber } from "@/components/ds/format";
import { SourceNotice } from "@/components/SectionResilience";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pickLanguage, type Language } from "@/lib/language";
import { buildStrategyBoardPack, PACK_TEXT, scenarioRows, SCENARIOS, strategyWorkbook, type Forecast } from "@/lib/strategyBoardPack";
import { downloadBytes, weeklyDeckPptx } from "@/lib/weeklyDeckPptx";
import { traceText } from "@/lib/strategyTrace";
import { trpc } from "@/lib/trpc";

// Q-21 (b), batch 3: the scenarios side by side and the board pack. The table is scenarioRows — the same rows, written the same way, that the pack's slide
// prints — so the board sees on paper what the screen says. Every figure is the server's (strategy.forecast); nothing is added up here.
const TEXT = {
  ar: { title: "السيناريوهات وحزمة المجلس", pptx: "حزمة المجلس (PowerPoint)", xlsx: "النموذج (Excel)", preparing: "يُجهَّز الملف…", failed: "تعذّر تجهيز الملف؛ أعد المحاولة.", traceTitle: "سلسلة الحساب (السيناريو الأساسي)" },
  en: { title: "Scenarios and the board pack", pptx: "Board pack (PowerPoint)", xlsx: "Model (Excel)", preparing: "Preparing the file…", failed: "The file could not be prepared; try again.", traceTitle: "Calculation trace (base scenario)" },
  ur: { title: "منظرنامے اور بورڈ پیک", pptx: "بورڈ پیک (PowerPoint)", xlsx: "ماڈل (Excel)", preparing: "فائل تیار ہو رہی ہے…", failed: "فائل تیار نہ ہو سکی؛ دوبارہ کوشش کریں۔", traceTitle: "حساب کا سلسلہ (بنیادی منظرنامہ)" },
} satisfies Record<Language, Record<string, string>>;

export default function StrategyScenarios({ tenantId, language }: { tenantId: string; language: Language }) {
  const t = pickLanguage(language, TEXT); const p = PACK_TEXT[language];
  const forecast = trpc.strategy.forecast.useQuery({ tenantId });
  const assumptions = trpc.strategy.assumptions.useQuery({ tenantId });
  const [busy, setBusy] = useState<"" | "pptx" | "xlsx">("");
  const [failed, setFailed] = useState(false);
  const data = forecast.data as Forecast | undefined;
  const approved = (assumptions.data ?? []).filter(item => item.status === "approved").map(item => ({ code: item.code, name: item.name, values: item.values }));
  const download = async (kind: "pptx" | "xlsx") => {
    if (!data) return;
    setBusy(kind); setFailed(false);
    try {
      const file = `strategy-${data.asOf}`;
      if (kind === "pptx") downloadBytes(await weeklyDeckPptx(buildStrategyBoardPack({ forecast: data, assumptions: approved, language, company: p.title }), language), `${file}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      else downloadBytes(await strategyWorkbook({ forecast: data, assumptions: approved, language }), `${file}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch { setFailed(true); } finally { setBusy(""); }
  };
  const missing = data ? Array.from(new Set(SCENARIOS.flatMap(key => data.scenarios[key].missing))) : [];
  return <Card data-strategy-section="scenarios">
    <CardHeader className="pb-3"><CardTitle className="text-base">{t.title}</CardTitle></CardHeader>
    <CardContent className="grid gap-3">
      <SourceNotice query={forecast} isArabic={language === "ar"} title={t.title} />
      <SourceNotice query={assumptions} isArabic={language === "ar"} title={p.assumptions} />
      {data ? <>
        <p className="text-xs text-muted-foreground">{p.asOf} <bdi dir="ltr">{data.asOf}</bdi> · {p.horizon} <bdi dir="ltr">{formatNumber(data.horizonMonths)}</bdi> {p.months}</p>
        {/* a phone stacks each figure with its three scenario values (a 4-column table would hide two scenarios behind a sideways scroll); the table from sm up */}
        <dl className="grid gap-2 sm:hidden" data-strategy-scenarios-stacked>
          {scenarioRows(data, language).map(row => <div key={row[0]} className="rounded-[var(--radius-md)] border border-border px-3 py-2">
            <dt className="text-sm text-muted-foreground">{row[0]}</dt>
            {[p.conservative, p.base, p.optimistic].map((head, index) => <dd key={head} className="flex justify-between gap-2 text-sm"><span>{head}</span><bdi className="font-semibold">{row[index + 1]}</bdi></dd>)}
          </div>)}
        </dl>
        <div className="hidden overflow-x-auto sm:block" data-strategy-scenarios>
          <table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="text-muted-foreground">{[p.figure, p.conservative, p.base, p.optimistic].map(head => <th key={head} className="px-2 py-1 text-start font-medium">{head}</th>)}</tr></thead>
            <tbody>{scenarioRows(data, language).map(row => <tr key={row[0]} className="border-t border-border">{row.map((cell, index) => <td key={index} className={index === 0 ? "px-2 py-1" : "px-2 py-1 font-semibold"}><bdi>{cell}</bdi></td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="text-sm" data-strategy-backlog>{p.backlog}: <bdi dir="ltr">{formatNumber(data.backlog.scheduled.count)}</bdi> {p.contracts} {p.scheduled} · <bdi dir="ltr">{formatAmount(data.backlog.scheduled.remainingValue)}</bdi> {p.sar}
          {data.backlog.unscheduled.count ? <span className="text-warning-soft-foreground"> — <bdi dir="ltr">{formatNumber(data.backlog.unscheduled.count)}</bdi> {p.unscheduled} · <bdi dir="ltr">{formatAmount(data.backlog.unscheduled.remainingValue)}</bdi> {p.sar}</span> : null}</p>
        {missing.length ? <p className="text-sm text-warning-soft-foreground" data-strategy-missing>{p.missing}: <bdi dir="ltr">{missing.join(", ")}</bdi></p> : null}
        <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2">{t.traceTitle}</summary>
          <ul className="grid gap-1 ps-4" data-strategy-trace>{data.scenarios.base.trace.map(step => { const said = traceText(step, language); return <li key={step.figure} data-trace-step={step.figure}><span className="font-medium">{said.figure}</span>: <bdi>{said.formula}</bdi></li>; })}</ul>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={busy !== ""} data-strategy-download="pptx" onClick={() => void download("pptx")}>{busy === "pptx" ? t.preparing : t.pptx}</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy !== ""} data-strategy-download="xlsx" onClick={() => void download("xlsx")}>{busy === "xlsx" ? t.preparing : t.xlsx}</Button>
        </div>
        {failed ? <p role="alert" className="text-sm text-danger-soft-foreground">{t.failed}</p> : null}
      </> : null}
    </CardContent>
  </Card>;
}
