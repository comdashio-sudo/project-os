import React, { useState } from "react";
import { CheckedForm } from "@/components/CheckedForm";
import { formatDate, formatNumber } from "@/components/ds/format";
import { Select } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { useCan } from "@/lib/permissions";
import { SourceNotice } from "@/components/SectionResilience";
import { pickLanguage } from "@/lib/language";

type Warehouse = { id: string; code: string; name: string; active: boolean };
type Material = { id: string; code: string; description: string };

/**
 * Q-41 (adviser 18-11): the two warehouse operations the server already had and no screen called — «إرجاع» on an issue line (warehouses.returnToWarehouse)
 * and «تحويل إلى مشروع آخر» (warehouses.transferBetweenProjects). The server decides what matters (never more back than was issued, never more out than is
 * on the shelf, the right on BOTH projects, a reason, the audit row); this screen only collects the choice and shows the server's answer. Shown to whoever
 * manages stock on this project; anyone else sees nothing and makes no refused call. No money is shown here.
 */
export function WarehouseReturnTransfer({ tenantId, projectId, warehouses, materials, onMoved }: { tenantId: string; projectId: string; warehouses: Warehouse[]; materials: Material[]; onMoved: () => void }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { returnTitle: "إرجاع من الصرف", returnIntro: "اختر سطر الصرف، والكمية العائدة إلى المستودع، وسبب الإرجاع. لا يُرجَع أكثر مما صُرف.", issue: "سطر الصرف", returnable: "يمكن إرجاعه", quantity: "الكمية", reason: "السبب", doReturn: "إرجاع", returned: "أُرجعت الكمية إلى المستودع.", noIssues: "لا صرف يمكن إرجاعه في هذا المشروع.", transferTitle: "تحويل إلى مشروع آخر", transferIntro: "تُنقل الكمية بقيمتها إلى مستودع في مشروع آخر تملك عليه صلاحية المستودع أيضًا.", from: "من مستودع", material: "المادة", toProject: "إلى المشروع", toWarehouse: "إلى المستودع", doTransfer: "تحويل", transferred: "حُوّلت الكمية إلى المشروع الآخر.", noTargets: "لا مشروع آخر تملك عليه صلاحية المستودع، فلا تحويل متاح." },
    en: { returnTitle: "Return from an issue", returnIntro: "Choose the issue line, the quantity coming back to the warehouse, and why. No more comes back than was issued.", issue: "Issue line", returnable: "Can come back", quantity: "Quantity", reason: "Reason", doReturn: "Return", returned: "The quantity is back in the warehouse.", noIssues: "No issue of this project can be returned.", transferTitle: "Transfer to another project", transferIntro: "The quantity moves, with its value, to a warehouse of another project on which you also manage stock.", from: "From warehouse", material: "Material", toProject: "To project", toWarehouse: "To warehouse", doTransfer: "Transfer", transferred: "The quantity moved to the other project.", noTargets: "You manage stock on no other project, so no transfer is available." },
    ur: { returnTitle: "اجرا سے واپسی", returnIntro: "اجرا کی قطار، گودام میں واپس آنے والی مقدار اور وجہ منتخب کریں۔ جاری شدہ سے زیادہ واپس نہیں آتا۔", issue: "اجرا کی قطار", returnable: "واپس ہو سکتا ہے", quantity: "مقدار", reason: "وجہ", doReturn: "واپسی", returned: "مقدار گودام میں واپس آ گئی۔", noIssues: "اس پروجیکٹ کا کوئی اجرا واپس نہیں ہو سکتا۔", transferTitle: "دوسرے پروجیکٹ میں منتقلی", transferIntro: "مقدار اپنی قیمت کے ساتھ دوسرے پروجیکٹ کے گودام میں جاتی ہے جس پر آپ کو بھی گودام کی اجازت ہو۔", from: "گودام سے", material: "مادّہ", toProject: "پروجیکٹ کو", toWarehouse: "گودام کو", doTransfer: "منتقل کریں", transferred: "مقدار دوسرے پروجیکٹ میں منتقل ہو گئی۔", noTargets: "آپ کسی دوسرے پروجیکٹ پر گودام کا انتظام نہیں کرتے، اس لیے منتقلی دستیاب نہیں۔" },
  });
  const canManage = useCan("project.inventory.manage", projectId);
  const issues = trpc.warehouses.returnableIssues.useQuery({ tenantId, projectId }, { enabled: canManage });
  const targets = trpc.warehouses.transferTargets.useQuery({ tenantId, projectId }, { enabled: canManage });
  const [back, setBack] = useState({ materialIssueId: "", quantity: "", reason: "" });
  const [move, setMove] = useState({ sourceWarehouseId: "", materialId: "", destinationProjectId: "", destinationWarehouseId: "", quantity: "", reason: "" });
  const [done, setDone] = useState<string | null>(null);
  const giveBack = trpc.warehouses.returnToWarehouse.useMutation({ onSuccess: () => { setDone(t.returned); setBack({ materialIssueId: "", quantity: "", reason: "" }); void issues.refetch(); onMoved(); } });
  const transfer = trpc.warehouses.transferBetweenProjects.useMutation({ onSuccess: () => { setDone(t.transferred); setMove({ sourceWarehouseId: "", materialId: "", destinationProjectId: "", destinationWarehouseId: "", quantity: "", reason: "" }); onMoved(); } });
  if (!canManage) return null;
  const chosenIssue = issues.data?.find(issue => issue.id === back.materialIssueId);
  const destination = targets.data?.find(project => project.id === move.destinationProjectId);
  const field = "grid gap-1";
  return <div className="grid gap-5">
    <SourceNotice query={issues} isArabic={isArabic} title={t.returnTitle} />
    <SourceNotice query={targets} isArabic={isArabic} title={t.transferTitle} />
    <section aria-labelledby="warehouse-return-title" className="grid gap-3 rounded-lg border p-3">
      <h3 id="warehouse-return-title" className="text-sm font-semibold">{t.returnTitle}</h3>
      <p className="text-xs text-muted-foreground">{t.returnIntro}</p>
      {issues.data && issues.data.length === 0 ? <p className="text-sm text-muted-foreground">{t.noIssues}</p> : null}
      {issues.data && issues.data.length > 0 ? <CheckedForm className="grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); setDone(null); if (back.materialIssueId && Number(back.quantity) > 0) giveBack.mutate({ tenantId, projectId, materialIssueId: back.materialIssueId, quantity: Number(back.quantity), reason: back.reason, returnedAt: new Date() }); }}>
        <div className={field}><Label htmlFor="return-issue">{t.issue}</Label><Select id="return-issue" value={back.materialIssueId} placeholder="—" required onValueChange={value => setBack({ ...back, materialIssueId: value })} options={issues.data.map(issue => ({ value: issue.id, label: `${issue.material?.code ?? "—"} · ${formatDate(issue.issuedAt, language)} · ${t.returnable}: ${formatNumber(issue.returnable, 3)} ${issue.material?.unit ?? ""}` }))} /></div>
        <div className={field}><Label htmlFor="return-quantity">{t.quantity}</Label><Input id="return-quantity" type="number" inputMode="decimal" step="0.001" min="0.001" max={chosenIssue?.returnable} value={back.quantity} onChange={event => setBack({ ...back, quantity: event.target.value })} required /></div>
        <div className={field}><Label htmlFor="return-reason">{t.reason}</Label><Input id="return-reason" value={back.reason} minLength={3} maxLength={500} onChange={event => setBack({ ...back, reason: event.target.value })} required /></div>
        <Button type="submit" className="min-h-11" disabled={giveBack.isPending}>{t.doReturn}</Button>
        {giveBack.error ? <p role="alert" className="text-sm text-destructive md:col-span-3">{getLocalizedProjectError(giveBack.error, isArabic)}</p> : null}
      </CheckedForm> : null}
    </section>
    <section aria-labelledby="warehouse-transfer-title" className="grid gap-3 rounded-lg border p-3">
      <h3 id="warehouse-transfer-title" className="text-sm font-semibold">{t.transferTitle}</h3>
      <p className="text-xs text-muted-foreground">{t.transferIntro}</p>
      {targets.data && targets.data.length === 0 ? <p className="text-sm text-muted-foreground">{t.noTargets}</p> : null}
      {targets.data && targets.data.length > 0 ? <CheckedForm className="grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); setDone(null); if (move.sourceWarehouseId && move.materialId && move.destinationProjectId && move.destinationWarehouseId && Number(move.quantity) > 0) transfer.mutate({ tenantId, sourceProjectId: projectId, sourceWarehouseId: move.sourceWarehouseId, destinationProjectId: move.destinationProjectId, destinationWarehouseId: move.destinationWarehouseId, materialId: move.materialId, quantity: Number(move.quantity), reason: move.reason, transferredAt: new Date() }); }}>
        <div className={field}><Label htmlFor="transfer-source">{t.from}</Label><Select id="transfer-source" value={move.sourceWarehouseId} placeholder="—" required onValueChange={value => setMove({ ...move, sourceWarehouseId: value })} options={warehouses.filter(item => item.active).map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></div>
        <div className={field}><Label htmlFor="transfer-material">{t.material}</Label><Select id="transfer-material" value={move.materialId} placeholder="—" required onValueChange={value => setMove({ ...move, materialId: value })} options={materials.map(item => ({ value: item.id, label: `${item.code} · ${item.description}` }))} /></div>
        <div className={field}><Label htmlFor="transfer-project">{t.toProject}</Label><Select id="transfer-project" value={move.destinationProjectId} placeholder="—" required onValueChange={value => setMove({ ...move, destinationProjectId: value, destinationWarehouseId: "" })} options={targets.data.map(project => ({ value: project.id, label: `${project.code} · ${project.name}` }))} /></div>
        <div className={field}><Label htmlFor="transfer-warehouse">{t.toWarehouse}</Label><Select id="transfer-warehouse" value={move.destinationWarehouseId} placeholder="—" required disabled={!destination} onValueChange={value => setMove({ ...move, destinationWarehouseId: value })} options={(destination?.warehouses ?? []).map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></div>
        <div className={field}><Label htmlFor="transfer-quantity">{t.quantity}</Label><Input id="transfer-quantity" type="number" inputMode="decimal" step="0.001" min="0.001" value={move.quantity} onChange={event => setMove({ ...move, quantity: event.target.value })} required /></div>
        <div className={field}><Label htmlFor="transfer-reason">{t.reason}</Label><Input id="transfer-reason" value={move.reason} minLength={3} maxLength={500} onChange={event => setMove({ ...move, reason: event.target.value })} required /></div>
        <Button type="submit" className="min-h-11" disabled={transfer.isPending}>{t.doTransfer}</Button>
        {transfer.error ? <p role="alert" className="text-sm text-destructive md:col-span-3">{getLocalizedProjectError(transfer.error, isArabic)}</p> : null}
      </CheckedForm> : null}
    </section>
    {done ? <p role="status" className="text-sm text-emerald-700">{done}</p> : null}
  </div>;
}
