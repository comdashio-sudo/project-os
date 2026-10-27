import { riyalLabel } from "@/lib/profitabilityView";
import { ListSelect, Option } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
// Tenders before award (work order 5, item 8): packages, the invitation list, bid entry, the levelled comparison and the award that creates the
// contract and the commitment. Every write is shown only to someone who holds its power (WriteGate); the server judges every call anyway,
// including the rule about people (whoever entered a bid of the package does not award it).
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { enumLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { SourceNotice } from "@/components/SectionResilience";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import type { ExportColumn } from "@/lib/excelExport";
import { WriteGate } from "@/lib/permissions";
import { pickLanguage } from "@/lib/language";

const field = "mt-1 block min-h-[44px] w-full rounded-lg border border-input bg-card px-3 text-sm";
const KINDS = ["scope_gap", "exclusion", "correction", "discount"] as const;
const noWrite = (ar: string, en: string, ur: string) => ({ ar: `لا تملك صلاحية ${ar}، فالقسم للعرض فقط.`, en: `You do not have permission to ${en}; this section is read-only for you.`, ur: `آپ کو ${ur} کی اجازت نہیں ہے؛ یہ حصہ آپ کے لیے صرف دیکھنے کے لیے ہے۔` });

export function ProjectTenders({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic, language } = useLanguage();
  const scope = { tenantId, projectId };
  const [selected, setSelected] = useState<string | null>(null);
  const packages = trpc.tenders.packages.useQuery({ ...scope, limit: 100 });
  const suppliers = trpc.tenders.suppliers.useQuery(scope);
  const invitees = trpc.tenders.invitees.useQuery({ ...scope, packageId: selected ?? "" }, { enabled: Boolean(selected) });
  const comparison = trpc.tenders.comparison.useQuery({ ...scope, packageId: selected ?? "" }, { enabled: Boolean(selected) });
  const refresh = () => { void packages.refetch(); if (selected) { void invitees.refetch(); void comparison.refetch(); } };
  const createPackage = trpc.tenders.createPackage.useMutation({ onSuccess: refresh });
  const invite = trpc.tenders.invite.useMutation({ onSuccess: refresh });
  const movePackage = trpc.tenders.transitionPackage.useMutation({ onSuccess: refresh });
  const enterBid = trpc.tenders.enterBid.useMutation({ onSuccess: refresh });
  const withdrawBid = trpc.tenders.withdrawBid.useMutation({ onSuccess: refresh });
  const disqualifyBid = trpc.tenders.disqualifyBid.useMutation({ onSuccess: refresh });
  const addAdjustment = trpc.tenders.addAdjustment.useMutation({ onSuccess: refresh });
  const removeAdjustment = trpc.tenders.removeAdjustment.useMutation({ onSuccess: refresh });
  const award = trpc.tenders.award.useMutation({ onSuccess: refresh });
  const [form, setForm] = useState({ packageCode: "", title: "", estimateAmount: "", currency: "SAR", scopeSummary: "" });
  const [supplierId, setSupplierId] = useState("");
  const [bid, setBid] = useState({ supplierId: "", amount: "", durationDays: "", validityDays: "", notes: "" });
  const [adjustment, setAdjustment] = useState({ bidId: "", kind: "scope_gap", description: "", amount: "" });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [winning, setWinning] = useState({ bidId: "", contractCode: "", justification: "" });
  const error = createPackage.error ?? invite.error ?? movePackage.error ?? enterBid.error ?? withdrawBid.error ?? disqualifyBid.error ?? addAdjustment.error ?? removeAdjustment.error ?? award.error;
  const t = pickLanguage(language, { ar: { title: "المناقصات قبل الترسية", note: "حزم المناقصة والمدعوون والعروض ومقارنتها وتسويتها، ثم الترسية التي تنشئ العقد والتزامه في الميزانية معًا. من يُدخل العروض لا يرسّي ولا يسوّي.", packagesTitle: "حزم المناقصة", code: "الرمز", name: "العنوان", estimate: "التقدير", currency: "العملة", scopeSummary: "ملخص النطاق", create: "إنشاء حزمة", status: "الحالة", invitees: "المدعوون", bids: "العروض", lowest: "أدنى سعر بعد التسوية", open: "فتح", close: "إغلاق باب العروض", reopen: "إعادة فتح الباب", cancel: "إلغاء", openPackage: "فتح الحزمة", empty: "لا حزم بعد.", loading: "جارٍ التحميل…", total: "إجمالي الحزم",
        invite: "دعوة مورد", pickSupplier: "اختر موردًا…", inviteesTitle: "قائمة المدعوين", bidEntry: "إدخال عرض", amount: "السعر", duration: "المدة (أيام)", validity: "صلاحية العرض (أيام)", notes: "ملاحظات", enter: "تسجيل العرض", withdraw: "سحب", comparisonTitle: "مقارنة العروض وتسويتها", rank: "الترتيب", supplier: "المورد", adjustments: "التسويات", levelled: "بعد التسوية", abovePct: "فوق الأدنى", vsEstimate: "مقابل التقدير", durationShort: "المدة", flags: "ملاحظات", lowestFlag: "الأدنى", belowFlag: "أقل من الوسيط بـ30%", aboveFlag: "أعلى من الوسيط بـ30%", medianLine: "الوسيط", comparable: "عروض صالحة للمقارنة",
        addAdj: "إضافة تسوية", pickBid: "اختر عرضًا…", kind: "النوع", description: "الوصف", adjAmount: "المبلغ (موجب للإضافة، سالب للخصم)", disqualify: "استبعاد", reason: "السبب", remove: "حذف", awardTitle: "الترسية", contractCode: "رمز العقد", justification: "تسبيب الترسية (يلزم بأقل من عرضين صالحين)", awardButton: "ترسية وإنشاء العقد والالتزام", awarded: "تمت الترسية", contract: "العقد", commitment: "الالتزام", created: "أُنشئ" }, en: { title: "Tenders before award", note: "Tender packages, invitees, bids, their comparison and levelling, then the award that creates the contract and its budget commitment together. Whoever enters bids neither awards nor levels.", packagesTitle: "Tender packages", code: "Code", name: "Title", estimate: "Estimate", currency: "Currency", scopeSummary: "Scope summary", create: "Create package", status: "Status", invitees: "Invitees", bids: "Bids", lowest: "Lowest after levelling", open: "Open", close: "Close bidding", reopen: "Reopen bidding", cancel: "Cancel", openPackage: "Open package", empty: "No packages yet.", loading: "Loading…", total: "Total packages",
        invite: "Invite supplier", pickSupplier: "Pick a supplier…", inviteesTitle: "Invitee list", bidEntry: "Enter a bid", amount: "Price", duration: "Duration (days)", validity: "Bid validity (days)", notes: "Notes", enter: "Record bid", withdraw: "Withdraw", comparisonTitle: "Bid comparison and levelling", rank: "Rank", supplier: "Supplier", adjustments: "Adjustments", levelled: "Levelled total", abovePct: "Above lowest", vsEstimate: "Vs estimate", durationShort: "Duration", flags: "Flags", lowestFlag: "Lowest", belowFlag: "30% below median", aboveFlag: "30% above median", medianLine: "Median", comparable: "comparable bids",
        addAdj: "Add adjustment", pickBid: "Pick a bid…", kind: "Kind", description: "Description", adjAmount: "Amount (positive adds, negative deducts)", disqualify: "Disqualify", reason: "Reason", remove: "Remove", awardTitle: "Award", contractCode: "Contract code", justification: "Award justification (required with fewer than two comparable bids)", awardButton: "Award and create contract and commitment", awarded: "Awarded", contract: "Contract", commitment: "Commitment", created: "created" }, ur: { title: "Tenders before award", note: "Tender packages, invitees, bids, their comparison and levelling, then the award that creates the contract and its budget commitment together. Whoever enters bids neither awards nor levels.", packagesTitle: "Tender packages", code: "Code", name: "Title", estimate: "Estimate", currency: "Currency", scopeSummary: "Scope summary", create: "Create package", status: "Status", invitees: "Invitees", bids: "Bids", lowest: "Lowest after levelling", open: "Open", close: "Close bidding", reopen: "Reopen bidding", cancel: "Cancel", openPackage: "Open package", empty: "No packages yet.", loading: "Loading…", total: "Total packages",
        invite: "Invite supplier", pickSupplier: "Pick a supplier…", inviteesTitle: "Invitee list", bidEntry: "Enter a bid", amount: "Price", duration: "Duration (days)", validity: "Bid validity (days)", notes: "Notes", enter: "Record bid", withdraw: "Withdraw", comparisonTitle: "Bid comparison and levelling", rank: "Rank", supplier: "Supplier", adjustments: "Adjustments", levelled: "Levelled total", abovePct: "Above lowest", vsEstimate: "Vs estimate", durationShort: "Duration", flags: "Flags", lowestFlag: "Lowest", belowFlag: "30% below median", aboveFlag: "30% above median", medianLine: "Median", comparable: "comparable bids",
        addAdj: "Add adjustment", pickBid: "Pick a bid…", kind: "Kind", description: "Description", adjAmount: "Amount (positive adds, negative deducts)", disqualify: "Disqualify", reason: "Reason", remove: "Remove", awardTitle: "Award", contractCode: "Contract code", justification: "Award justification (required with fewer than two comparable bids)", awardButton: "Award and create contract and commitment", awarded: "Awarded", contract: "Contract", commitment: "Commitment", created: "created" } });
  const label = (code: string) => enumLabel(code, language);
  const money = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat(pickLanguage(language, { ar: "ar-SA", en: "en-US", ur: "ur-PK" }), { maximumFractionDigits: 2 }).format(value);
  const pct = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value}%`;
  const submit = (action: () => void) => (event: React.FormEvent) => { event.preventDefault(); action(); };
  const list = packages.data?.packages ?? [];
  const current = comparison.data;
  const status = current?.package.status;
  const live = (current?.bids ?? []).filter(item => item.status === "submitted");
  const biddable = (invitees.data ?? []).filter(item => !(current?.bids ?? []).some(other => other.supplierId === item.supplierId));
  const sheet = (heading: string, children: React.ReactNode, action?: React.ReactNode) => <section className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{heading}</h3>{action}</div><div className="mt-3 space-y-3">{children}</div></section>;
  const flagText = (flag: string) => flag === "lowest" ? t.lowestFlag : flag === "below_median_30" ? t.belowFlag : t.aboveFlag;
  type Bid = NonNullable<typeof current>["bids"][number];
  // The comparison table's columns: the header text is what the screen shows, the value is the raw figure the Excel file gets.
  // Percentages are fractions (21.1% is 0.211). The currency is not a column, so it is not in the file.
  const bidColumns: ExportColumn<Bid>[] = [
    { header: t.rank, kind: "number", value: item => item.rank },
    { header: t.supplier, kind: "text", value: item => item.supplierName },
    { header: t.amount, kind: "money", value: item => item.amount },
    { header: t.adjustments, kind: "money", value: item => item.adjustments },
    { header: t.levelled, kind: "money", value: item => item.levelledTotal },
    { header: t.abovePct, kind: "percent", value: item => item.aboveLowestPercent === null ? null : item.aboveLowestPercent / 100 },
    { header: t.vsEstimate, kind: "percent", value: item => item.versusEstimatePercent === null ? null : item.versusEstimatePercent / 100 },
    { header: t.durationShort, kind: "number", value: item => item.durationDays },
    { header: t.flags, kind: "text", value: item => item.flags.map(flag => flagText(flag)).join("، ") || null },
  ];

  return <Card>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="text-xs leading-5 text-muted-foreground">{t.note}</p>
      <SourceNotice query={packages} isArabic={isArabic} title={t.packagesTitle} />
      <SourceNotice query={suppliers} isArabic={isArabic} title={t.supplier} />
      <SourceNotice query={comparison} isArabic={isArabic} title={t.comparisonTitle} />
      <SourceNotice query={invitees} isArabic={isArabic} title={t.inviteesTitle} />
      {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, isArabic)}</p> : null}

      {sheet(t.packagesTitle, <>
        <WriteGate permission="project.tender.manage" projectId={projectId} reason={noWrite("إنشاء حزم المناقصة", "create tender packages", "ٹینڈر پیکیجز بنانے")}>
          <CheckedForm className="grid gap-3 md:grid-cols-4" onSubmit={submit(() => createPackage.mutate({ ...scope, packageCode: form.packageCode, title: form.title, currency: form.currency, ...(form.estimateAmount ? { estimateAmount: Number(form.estimateAmount) } : {}), ...(form.scopeSummary ? { scopeSummary: form.scopeSummary } : {}) }, { onSuccess: () => setForm({ ...form, packageCode: "", title: "", estimateAmount: "", scopeSummary: "" }) }))}>
            <div><Label htmlFor="tp-code">{t.code}</Label><Input id="tp-code" value={form.packageCode} onChange={event => setForm({ ...form, packageCode: event.target.value })} required /></div>
            <div className="md:col-span-2"><Label htmlFor="tp-title">{t.name}</Label><Input id="tp-title" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required minLength={2} /></div>
            <div><Label htmlFor="tp-estimate">{t.estimate}</Label><Input id="tp-estimate" type="number" min="0" step="0.01" value={form.estimateAmount} onChange={event => setForm({ ...form, estimateAmount: event.target.value })} /></div>
            <div><Label htmlFor="tp-currency">{t.currency}</Label><Input id="tp-currency" value={form.currency} maxLength={3} onChange={event => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /></div>
            <div className="md:col-span-3"><Label htmlFor="tp-scope">{t.scopeSummary}</Label><Input id="tp-scope" value={form.scopeSummary} onChange={event => setForm({ ...form, scopeSummary: event.target.value })} /></div>
            <Button type="submit" disabled={createPackage.isPending} className="min-h-[44px] md:col-span-4">{t.create}</Button>
          </CheckedForm>
        </WriteGate>
        {list.length ? <><p className="text-xs text-muted-foreground">{t.total}: {packages.data?.total}</p><div className="divide-y rounded-xl border">{list.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <div><b>{item.packageCode} · {item.title}</b><p className="text-xs text-muted-foreground">{label(item.status)} · {t.invitees}: {item.invitees} · {t.bids}: {item.bids} · {t.lowest}: {money(item.lowestLevelled)}</p></div>
          <Button size="sm" variant={selected === item.id ? "default" : "outline"} onClick={() => setSelected(item.id)}>{t.openPackage}</Button>
        </div>)}</div></> : <p className="text-sm text-muted-foreground">{packages.isLoading ? t.loading : t.empty}</p>}
      </>)}

      {selected && current ? <section aria-label={`${current.package.packageCode} ${current.package.title}`} className="space-y-4 rounded-xl bg-accent p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{current.package.packageCode} · {current.package.title}</h3><span className="text-sm">{label(current.package.status)}</span></div>
        <WriteGate permission="project.tender.manage" projectId={projectId}><div className="flex flex-wrap gap-2">
          {status === "draft" ? <Button size="sm" disabled={movePackage.isPending} onClick={() => movePackage.mutate({ ...scope, packageId: selected, nextStatus: "open" })}>{t.open}</Button> : null}
          {status === "open" ? <Button size="sm" disabled={movePackage.isPending} onClick={() => movePackage.mutate({ ...scope, packageId: selected, nextStatus: "closed" })}>{t.close}</Button> : null}
          {status === "closed" ? <Button size="sm" variant="outline" disabled={movePackage.isPending} onClick={() => movePackage.mutate({ ...scope, packageId: selected, nextStatus: "open" })}>{t.reopen}</Button> : null}
          {status === "draft" || status === "open" || status === "closed" ? <Button size="sm" variant="outline" disabled={movePackage.isPending} onClick={() => movePackage.mutate({ ...scope, packageId: selected, nextStatus: "cancelled" })}>{t.cancel}</Button> : null}
        </div></WriteGate>

        {sheet(t.inviteesTitle, <>
          <ul className="grid gap-1 text-sm md:grid-cols-2">{(invitees.data ?? []).map(item => <li key={item.id} className="flex justify-between gap-2 rounded-lg bg-white/80 px-3 py-2"><span>{item.supplierName}</span><span className="text-xs text-muted-foreground">{label(item.status)}</span></li>)}</ul>
          {status === "draft" || status === "open" ? <WriteGate permission="project.tender.manage" projectId={projectId}><div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1"><Label htmlFor="ti-supplier">{t.supplier}</Label><ListSelect id="ti-supplier" className={field} value={supplierId} onChange={event => setSupplierId(event.target.value)}><Option value="">{t.pickSupplier}</Option>{(suppliers.data ?? []).filter(item => !(invitees.data ?? []).some(other => other.supplierId === item.id)).map(item => <Option key={item.id} value={item.id}>{item.legalName}</Option>)}</ListSelect></div>
            <Button disabled={!supplierId || invite.isPending} className="min-h-[44px]" onClick={() => invite.mutate({ ...scope, packageId: selected, supplierId }, { onSuccess: () => setSupplierId("") })}>{t.invite}</Button>
          </div></WriteGate> : null}
        </>)}

        {status === "open" ? <WriteGate permission="project.tender.bids" projectId={projectId} reason={noWrite("إدخال العروض", "enter bids", "بولیاں درج کرنے")}>{sheet(t.bidEntry,
          <CheckedForm className="grid gap-3 md:grid-cols-5" onSubmit={submit(() => enterBid.mutate({ ...scope, packageId: selected, supplierId: bid.supplierId, amount: Number(bid.amount), ...(bid.durationDays ? { durationDays: Number(bid.durationDays) } : {}), ...(bid.validityDays ? { validityDays: Number(bid.validityDays) } : {}), ...(bid.notes ? { notes: bid.notes } : {}) }, { onSuccess: () => setBid({ supplierId: "", amount: "", durationDays: "", validityDays: "", notes: "" }) }))}>
            <div><Label htmlFor="tb-supplier">{t.supplier}</Label><ListSelect id="tb-supplier" className={field} value={bid.supplierId} onChange={event => setBid({ ...bid, supplierId: event.target.value })} required><Option value="">{t.pickSupplier}</Option>{biddable.map(item => <Option key={item.supplierId} value={item.supplierId}>{item.supplierName}</Option>)}</ListSelect></div>
            <div><Label htmlFor="tb-amount">{t.amount}</Label><Input id="tb-amount" type="number" min="0.01" step="0.01" value={bid.amount} onChange={event => setBid({ ...bid, amount: event.target.value })} required /></div>
            <div><Label htmlFor="tb-duration">{t.duration}</Label><Input id="tb-duration" type="number" min="1" value={bid.durationDays} onChange={event => setBid({ ...bid, durationDays: event.target.value })} /></div>
            <div><Label htmlFor="tb-validity">{t.validity}</Label><Input id="tb-validity" type="number" min="1" value={bid.validityDays} onChange={event => setBid({ ...bid, validityDays: event.target.value })} /></div>
            <div><Label htmlFor="tb-notes">{t.notes}</Label><Input id="tb-notes" value={bid.notes} onChange={event => setBid({ ...bid, notes: event.target.value })} /></div>
            <Button type="submit" disabled={enterBid.isPending} className="min-h-[44px] md:col-span-5">{t.enter}</Button>
          </CheckedForm>)}</WriteGate> : null}

        {sheet(t.comparisonTitle, <>
          <p className="text-xs text-muted-foreground">{t.comparable}: {current.comparable} · {t.lowest}: {money(current.lowest)} · {t.medianLine}: {money(current.median)}</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="text-start text-xs text-muted-foreground">{bidColumns.map(column => <th key={column.header} className="p-2 text-start">{column.header}</th>)}</tr></thead>
            <tbody>{current.bids.map(item => <tr key={item.id} className="border-t align-top">
              <td className="p-2">{item.rank ?? "—"}</td>
              <td className="p-2"><b>{item.supplierName}</b><div className="text-xs text-muted-foreground">{label(item.status)}{item.statusReason ? ` · ${item.statusReason}` : ""}</div>
                {item.adjustmentLines.map(line => <div key={line.id} className="mt-1 flex items-center gap-2 text-xs"><span>{label(line.kind)}: {line.description} ({money(line.amount)})</span>{status === "closed" ? <WriteGate permission="project.tender.level" projectId={projectId}><button type="button" className="text-danger-soft-foreground underline" onClick={() => removeAdjustment.mutate({ ...scope, adjustmentId: line.id })}>{t.remove}</button></WriteGate> : null}</div>)}
                {item.status === "submitted" ? <div className="mt-2 flex flex-wrap items-center gap-2">
                  {status === "open" ? <WriteGate permission="project.tender.bids" projectId={projectId}><Button size="sm" variant="outline" disabled={withdrawBid.isPending} onClick={() => withdrawBid.mutate({ ...scope, bidId: item.id })}>{t.withdraw}</Button></WriteGate> : null}
                  {status === "closed" ? <WriteGate permission="project.tender.level" projectId={projectId}><Input aria-label={`${t.reason} ${item.supplierName}`} placeholder={t.reason} className="h-9 w-40" value={reasons[item.id] ?? ""} onChange={event => setReasons({ ...reasons, [item.id]: event.target.value })} /><Button size="sm" variant="outline" disabled={(reasons[item.id] ?? "").trim().length < 3 || disqualifyBid.isPending} onClick={() => disqualifyBid.mutate({ ...scope, bidId: item.id, reason: reasons[item.id]!.trim() })}>{t.disqualify}</Button></WriteGate> : null}
                </div> : null}</td>
              <td className="p-2">{money(item.amount)} {riyalLabel(isArabic)}</td><td className="p-2">{money(item.adjustments)}</td><td className="p-2 font-semibold">{money(item.levelledTotal)}</td>
              <td className="p-2">{item.aboveLowestPercent === null ? "—" : `${item.aboveLowestPercent}%`}</td><td className="p-2">{pct(item.versusEstimatePercent)}</td><td className="p-2">{item.durationDays ?? "—"}</td>
              <td className="p-2 text-xs">{item.flags.map(flag => flagText(flag)).join("، ") || "—"}</td></tr>)}</tbody></table></div>
          {status === "closed" && live.length ? <WriteGate permission="project.tender.level" projectId={projectId} reason={noWrite("تسوية العروض", "level bids", "بولیوں کا موازنہ ہم وار کرنے")}>
            <CheckedForm className="grid gap-3 md:grid-cols-5" onSubmit={submit(() => addAdjustment.mutate({ ...scope, bidId: adjustment.bidId, kind: adjustment.kind as never, description: adjustment.description, amount: Number(adjustment.amount) }, { onSuccess: () => setAdjustment({ bidId: adjustment.bidId, kind: "scope_gap", description: "", amount: "" }) }))}>
              <div><Label htmlFor="ta-bid">{t.supplier}</Label><ListSelect id="ta-bid" className={field} value={adjustment.bidId} onChange={event => setAdjustment({ ...adjustment, bidId: event.target.value })} required><Option value="">{t.pickBid}</Option>{live.map(item => <Option key={item.id} value={item.id}>{item.supplierName}</Option>)}</ListSelect></div>
              <div><Label htmlFor="ta-kind">{t.kind}</Label><ListSelect id="ta-kind" className={field} value={adjustment.kind} onChange={event => setAdjustment({ ...adjustment, kind: event.target.value })}>{KINDS.map(code => <Option key={code} value={code}>{label(code)}</Option>)}</ListSelect></div>
              <div className="md:col-span-2"><Label htmlFor="ta-description">{t.description}</Label><Input id="ta-description" value={adjustment.description} onChange={event => setAdjustment({ ...adjustment, description: event.target.value })} required minLength={3} /></div>
              <div><Label htmlFor="ta-amount">{t.adjAmount}</Label><Input id="ta-amount" type="number" step="0.01" value={adjustment.amount} onChange={event => setAdjustment({ ...adjustment, amount: event.target.value })} required /></div>
              <Button type="submit" disabled={addAdjustment.isPending} className="min-h-[44px] md:col-span-5">{t.addAdj}</Button>
            </CheckedForm></WriteGate> : null}
        </>, <ExportExcelButton fileName="tenders-bid-comparison" sheetName={t.comparisonTitle} title={`${t.title} · ${t.comparisonTitle}`} rows={current.bids} columns={bidColumns} />)}

        {status === "awarded" ? <p role="status" className="rounded-lg bg-white/80 p-3 text-sm font-semibold text-success-soft-foreground">{t.awarded} · {t.contract}: {current.package.awardedContractId?.slice(0, 8)} · {t.commitment}: {current.package.awardedCommitmentId?.slice(0, 8)}</p> : null}
        {status === "closed" && live.length ? <WriteGate permission="project.tender.award" projectId={projectId} reason={noWrite("ترسية المناقصات", "award tenders", "ٹینڈرز کا ایوارڈ دینے")}>{sheet(t.awardTitle,
          <CheckedForm className="grid gap-3 md:grid-cols-4" onSubmit={submit(() => award.mutate({ ...scope, packageId: selected, bidId: winning.bidId, contractCode: winning.contractCode, ...(winning.justification ? { justification: winning.justification } : {}) }))}>
            <div className="md:col-span-2"><Label htmlFor="aw-bid">{t.supplier}</Label><ListSelect id="aw-bid" className={field} value={winning.bidId} onChange={event => setWinning({ ...winning, bidId: event.target.value })} required><Option value="">{t.pickBid}</Option>{live.map(item => <Option key={item.id} value={item.id}>{item.rank}. {item.supplierName} — {money(item.levelledTotal)}</Option>)}</ListSelect></div>
            <div><Label htmlFor="aw-code">{t.contractCode}</Label><Input id="aw-code" value={winning.contractCode} onChange={event => setWinning({ ...winning, contractCode: event.target.value })} required /></div>
            <div className="md:col-span-4"><Label htmlFor="aw-justification">{t.justification}</Label><Input id="aw-justification" value={winning.justification} onChange={event => setWinning({ ...winning, justification: event.target.value })} /></div>
            <Button type="submit" disabled={award.isPending} className="min-h-[44px] md:col-span-4">{t.awardButton}</Button>
          </CheckedForm>)}</WriteGate> : null}
      </section> : null}
    </CardContent>
  </Card>;
}
