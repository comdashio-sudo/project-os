import React, { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProjectMaterials({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const t = isArabic ? { title: "كتالوج المواد", create: "إضافة مادة للمؤسسة", code: "رمز المادة", description: "الوصف", uom: "وحدة القياس", category: "التصنيف", spec: "المواصفة المرجعية", save: "حفظ المادة", override: "تخصيص للمشروع", material: "المادة", projectDescription: "وصف المشروع", active: "متاحة في هذا المشروع", saveOverride: "حفظ التخصيص", empty: "لا توجد مواد في كتالوج المؤسسة بعد.", loading: "جارٍ تحميل كتالوج المواد..." } : { title: "Material catalog", create: "Add tenant material", code: "Material code", description: "Description", uom: "Unit of measure", category: "Category", spec: "Reference specification", save: "Save material", override: "Project override", material: "Material", projectDescription: "Project description", active: "Available in this project", saveOverride: "Save override", empty: "No materials are in this workspace catalog yet.", loading: "Loading material catalog..." };
  const catalog = trpc.materials.list.useQuery({ tenantId, projectId });
  const create = trpc.materials.createMaster.useMutation({ onSuccess: () => catalog.refetch() });
  const saveOverride = trpc.materials.saveProjectOverride.useMutation({ onSuccess: () => catalog.refetch() });
  const [master, setMaster] = useState({ code: "", description: "", unitOfMeasure: "", category: "", referenceSpecification: "" });
  const [override, setOverride] = useState({ materialId: "", projectDescription: "", referenceSpecification: "", active: true });
  const error = create.error ?? saveOverride.error;
  if (catalog.isLoading) return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  return <Card><CardHeader><CardTitle>{t.title}</CardTitle></CardHeader><CardContent className="space-y-5">
    <form className="grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); create.mutate({ tenantId, ...master, referenceSpecification: master.referenceSpecification || undefined }); }}>
      <div><Label htmlFor="material-code">{t.code}</Label><Input id="material-code" value={master.code} onChange={event => setMaster({ ...master, code: event.target.value })} required /></div>
      <div><Label htmlFor="material-description">{t.description}</Label><Input id="material-description" value={master.description} onChange={event => setMaster({ ...master, description: event.target.value })} required /></div>
      <div><Label htmlFor="material-uom">{t.uom}</Label><Input id="material-uom" value={master.unitOfMeasure} onChange={event => setMaster({ ...master, unitOfMeasure: event.target.value })} required /></div>
      <div><Label htmlFor="material-category">{t.category}</Label><Input id="material-category" value={master.category} onChange={event => setMaster({ ...master, category: event.target.value })} required /></div>
      <div className="md:col-span-2"><Label htmlFor="material-spec">{t.spec}</Label><Input id="material-spec" value={master.referenceSpecification} onChange={event => setMaster({ ...master, referenceSpecification: event.target.value })} /></div>
      <Button type="submit" disabled={create.isPending}>{t.save}</Button>
    </form>
    {catalog.data?.length ? <><div className="grid gap-2">{catalog.data.map(item => <div key={item.id} className="rounded-lg border p-3 text-sm"><strong>{item.code}</strong> · {item.override?.projectDescription || item.description} <span className="text-muted-foreground">({item.unitOfMeasure} · {item.category})</span></div>)}</div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); if (override.materialId) saveOverride.mutate({ tenantId, projectId, ...override, projectDescription: override.projectDescription || undefined, referenceSpecification: override.referenceSpecification || undefined }); }}>
        <div><Label htmlFor="override-material">{t.material}</Label><select id="override-material" className="h-9 w-full rounded-md border bg-background px-3" value={override.materialId} onChange={event => setOverride({ ...override, materialId: event.target.value })} required><option value="">—</option>{catalog.data.map(item => <option key={item.id} value={item.id}>{item.code}</option>)}</select></div>
        <div><Label htmlFor="override-description">{t.projectDescription}</Label><Input id="override-description" value={override.projectDescription} onChange={event => setOverride({ ...override, projectDescription: event.target.value })} /></div>
        <div><Label htmlFor="override-spec">{t.spec}</Label><Input id="override-spec" value={override.referenceSpecification} onChange={event => setOverride({ ...override, referenceSpecification: event.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input aria-label={t.active} type="checkbox" checked={override.active} onChange={event => setOverride({ ...override, active: event.target.checked })} />{t.active}</label><Button type="submit" disabled={saveOverride.isPending}>{t.saveOverride}</Button>
      </form></> : <p className="text-sm text-muted-foreground">{t.empty}</p>}
    {error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(error, isArabic)}</p> : null}
  </CardContent></Card>;
}
