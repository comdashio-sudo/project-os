// Q-24 (P-120): what a screen kept on this phone while offline — how many wait to be sent, and each one the server refused with its reason
// (a conflict names the villas). «Discard» drops a refused one; «Send now» sends what waits. Nothing here sends anything by itself: the queue does.
import React from "react";
import { Button } from "@/components/ds";
import type { Language } from "@/lib/language";
import { pickLanguage } from "@/lib/language";
import type { QueueItem } from "@/lib/offlineQueue";

const text = {
  ar: { offline: "لا اتصال: ما تحفظه يبقى على هذا الهاتف ويُرسل عند عودة الاتصال.", waiting: (n: number) => `${n} بانتظار الإرسال`, sendNow: "أرسل الآن", sending: "جارٍ الإرسال…", refused: "لم يُقبل — راجعه ثم احذفه:", discard: "احذف من الهاتف", noIdentity: "تعذّر التحقق من هويتك، فالحفظ دون اتصال معطّل حتى يعود؛ احفظ وأنت متصل." },
  en: { offline: "No connection: what you save stays on this phone and is sent when the connection returns.", waiting: (n: number) => `${n} waiting to be sent`, sendNow: "Send now", sending: "Sending…", refused: "Not accepted — check it, then discard it:", discard: "Discard from the phone", noIdentity: "Could not check who you are, so saving offline is off until it is back; save while online." },
  ur: { offline: "کنکشن نہیں: جو آپ محفوظ کریں وہ اس فون پر رہے گا اور کنکشن واپس آنے پر بھیجا جائے گا۔", waiting: (n: number) => `${n} بھیجنے کے منتظر`, sendNow: "ابھی بھیجیں", sending: "بھیجا جا رہا ہے…", refused: "قبول نہیں ہوا — دیکھیں پھر حذف کریں:", discard: "فون سے حذف کریں", noIdentity: "آپ کی شناخت کی جانچ نہ ہو سکی، اس لیے آف لائن محفوظ کرنا بند ہے؛ کنکشن پر محفوظ کریں۔" },
};

export function OfflineQueuePanel({ items, online, flushing, onFlush, onDiscard, reason, language, identityError }: { identityError?: unknown; items: QueueItem[]; online: boolean; flushing: boolean; onFlush: () => void; onDiscard: (id: string) => void; reason: (item: QueueItem) => string[]; language: Language }) {
  const t = pickLanguage(language, text);
  const pending = items.filter(item => item.status === "pending");
  const failed = items.filter(item => item.status === "failed");
  // without the signed-in person the queue has no owner (a shared phone), so nothing is kept: said, not hidden
  if (identityError) return <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground" data-offline-off>{t.noIdentity}</p>;
  if (online && !pending.length && !failed.length) return null;
  return (
    <section className="flex flex-col gap-2" data-offline-queue>
      {!online && <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm font-semibold text-warning-soft-foreground">{t.offline}</p>}
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span data-offline-waiting>{t.waiting(pending.length)}</span>
          <Button variant="secondary" className="min-h-11" disabled={!online || flushing} onClick={onFlush}>{flushing ? t.sending : t.sendNow}</Button>
        </div>
      )}
      {failed.length > 0 && (
        <div role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground" data-offline-refused>
          <p className="font-semibold">{t.refused}</p>
          <ul className="mt-2 flex flex-col gap-2">{failed.map(item => (
            <li key={item.id} className="flex flex-col gap-1">
              <span className="font-medium">{item.summary}</span>
              <ul className="list-disc ps-5">{reason(item).map((line, index) => <li key={index}>{line}</li>)}</ul>
              <Button variant="ghost" className="min-h-11 self-start" onClick={() => onDiscard(item.id)}>{t.discard}</Button>
            </li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}
