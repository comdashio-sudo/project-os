import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { FileInput } from "lucide-react";
import React, { useState } from "react";

// Q-43 batch 5b (docs/proposals/subcontractor-progress.md §6 «في المستخلص: زر إضافة من الإثباتات المعتمدة»): the approved work confirmations of the chosen
// subcontract that no certificate holds yet, picked and turned into a certificate. Only for whoever may manage commitments (the server checks it again and
// prices every line from BOQ — no price is typed or shown here). A confirmation with a unit line or a historical line is shown with why it cannot be pulled.
const tap = "min-h-[44px]";

const text = {
  ar: {
    title: "من الإثباتات المعتمدة", hint: "اختر إثباتات الكميات المعتمدة لهذا العقد؛ يُنشأ مستخلص بأسطرها مجموعة لكل بند، والسعر من جدول الكميات. كل إثبات يُسحب مرة واحدة.",
    chooseContract: "اختر عقدًا أعلاه لترى إثباتاته المعتمدة.", none: "لا إثبات معتمد غير مسحوب لهذا العقد.", number: "رقم المستخلص", start: "بداية الفترة", end: "نهاية الفترة",
    create: (count: number) => `أنشئ مستخلصًا من ${count} إثبات`, units: "فيه أسطر وحدات بلا سعر في جدول الكميات: أضفها يدويًا ببندها", historical: "فيه أعمال تاريخية: لا تُسحب", created: "أُنشئ المستخلص من الإثباتات", numberShort: "اكتب رقم المستخلص.",
  },
  en: {
    title: "From approved confirmations", hint: "Pick the approved quantity confirmations of this contract; a certificate is created with their lines summed per item, priced from the BOQ. Each confirmation is pulled once.",
    chooseContract: "Choose a contract above to see its approved confirmations.", none: "No approved confirmation of this contract is waiting to be pulled.", number: "Certificate number", start: "Period start", end: "Period end",
    create: (count: number) => `Create a certificate from ${count} confirmation${count === 1 ? "" : "s"}`, units: "Has unit lines with no BOQ rate: add them by hand against their item", historical: "Has historical work: not pulled", created: "The certificate was created from the confirmations", numberShort: "Enter the certificate number.",
  },
  ur: {
    title: "منظور شدہ تصدیقات سے", hint: "اس معاہدے کی منظور شدہ مقدار والی تصدیقات چنیں؛ ان کی لائنیں ہر آئٹم کے حساب سے جمع ہو کر بل بنتا ہے، قیمت BOQ سے۔ ہر تصدیق ایک ہی بار شامل ہوتی ہے۔",
    chooseContract: "اس کی منظور شدہ تصدیقات دیکھنے کے لیے اوپر ایک معاہدہ چنیں۔", none: "اس معاہدے کی کوئی منظور شدہ تصدیق شامل ہونے کی منتظر نہیں۔", number: "بل نمبر", start: "مدت کا آغاز", end: "مدت کا اختتام",
    create: (count: number) => `${count} تصدیقات سے بل بنائیں`, units: "اس میں یونٹ لائنیں ہیں جن کا BOQ ریٹ نہیں: انہیں ان کے آئٹم کے ساتھ ہاتھ سے شامل کریں", historical: "اس میں تاریخی کام ہے: شامل نہیں ہوتا", created: "تصدیقات سے بل بن گیا", numberShort: "بل نمبر لکھیں۔",
  },
};

type Line = { kind: string; quantity: number | null; boqCode: string | null; unitOfMeasure: string | null; historical: boolean };
type Confirmation = { id: string; number: string; periodStart: string; periodEnd: string; status: string; certificateId?: string | null; lines: Line[] };

/** Why a confirmation cannot be pulled, or null when it can (quantity lines only, none historical). */
export const blockedBy = (row: Confirmation): "units" | "historical" | null =>
  row.lines.some(line => line.historical) ? "historical" : row.lines.some(line => line.kind !== "quantity") ? "units" : null;

export function PullConfirmationsToCertificate({ tenantId, projectId, subcontractId }: { tenantId: string; projectId: string; subcontractId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const canPull = useCan("project.commitment.manage", projectId);
  const utils = trpc.useUtils();
  const list = trpc.workConfirmations.list.useQuery({ tenantId, projectId, subcontractId }, { enabled: Boolean(canPull && subcontractId) });
  const [picked, setPicked] = useState<string[]>([]);
  const [number, setNumber] = useState("");
  const [numberShort, setNumberShort] = useState(false);
  const [done, setDone] = useState(false);
  const create = trpc.subcontracts.createCertificate.useMutation({ onSuccess: async () => { setDone(true); setPicked([]); setNumber(""); await Promise.all([utils.subcontracts.listCertificates.invalidate(), utils.workConfirmations.list.invalidate()]); } });
  if (!canPull) return null;
  const rows = ((list.data ?? []) as Confirmation[]).filter(row => row.status === "approved" && !row.certificateId);
  const chosen = rows.filter(row => picked.includes(row.id));
  // the period runs from the earliest start to the latest end of what is picked
  const start = chosen.map(row => row.periodStart).sort()[0] ?? "";
  const end = chosen.map(row => row.periodEnd).sort().at(-1) ?? "";
  const submit = () => {
    if (!number.trim()) { setNumberShort(true); return; }
    setNumberShort(false); setDone(false);
    create.mutate({ tenantId, projectId, subcontractId, certificateNumber: number.trim(), periodStart: new Date(`${start}T00:00:00.000Z`), periodEnd: new Date(`${end}T00:00:00.000Z`), lines: [], confirmationIds: chosen.map(row => row.id) });
  };
  return (
    <section className="mt-4 space-y-2 rounded-xl border p-3 text-sm" aria-label={t.title} data-testid="pull-confirmations">
      <p className="flex items-center gap-2 font-semibold"><FileInput className="h-4 w-4" aria-hidden />{t.title}</p>
      <p className="text-xs text-muted-foreground">{t.hint}</p>
      {!subcontractId ? <p className="text-muted-foreground">{t.chooseContract}</p> : list.data && rows.length === 0 ? <p className="text-muted-foreground">{t.none}</p> : null}
      {list.error && <p role="alert" className="text-danger-soft-foreground">{getLocalizedProjectError(list.error, language)}</p>}
      {rows.length > 0 && <ul className="divide-y rounded-lg border">
        {rows.map(row => {
          const blocked = blockedBy(row);
          return (
            <li key={row.id} className="p-2">
              <label className={`flex items-start gap-3 ${tap} ${blocked ? "opacity-60" : "cursor-pointer"}`}>
                <input type="checkbox" className="mt-1 h-5 w-5" disabled={Boolean(blocked)} checked={picked.includes(row.id)} onChange={event => setPicked(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} aria-label={row.number} />
                <span className="min-w-0">
                  <span className="font-medium"><bdi>{row.number}</bdi></span> <span className="text-xs text-muted-foreground"><bdi>{row.periodStart}</bdi> – <bdi>{row.periodEnd}</bdi></span>
                  <span className="block text-xs text-muted-foreground">{row.lines.filter(line => line.kind === "quantity").map((line, index) => <bdi key={index} className="me-2">{line.boqCode}: {line.quantity} {line.unitOfMeasure ?? ""}</bdi>)}</span>
                  {blocked && <span className="block text-xs text-warning-soft-foreground" data-blocked={blocked}>{blocked === "units" ? t.units : t.historical}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>}
      {chosen.length > 0 && <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1"><span className="text-xs font-medium">{t.number}</span><Input className={`mt-1 ${tap}`} value={number} maxLength={80} onChange={event => setNumber(event.target.value)} /></label>
        <p className="text-xs text-muted-foreground">{t.start}: <bdi>{start}</bdi> · {t.end}: <bdi>{end}</bdi></p>
        <Button type="button" className={tap} disabled={create.isPending} onClick={submit}>{t.create(chosen.length)}</Button>
      </div>}
      {numberShort && <p role="alert" className="text-danger-soft-foreground">{t.numberShort}</p>}
      {done && <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-success-soft-foreground">{t.created}</p>}
      {create.error && <p role="alert" className="text-danger-soft-foreground">{getLocalizedProjectError(create.error, language)}</p>}
    </section>
  );
}
