import React, { useEffect, useState } from "react";
import { Button } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

/** Q-44: how long after a save its «undo» is offered — the server refuses after the same 15 minutes (server/pmcUndo.ts UNDO_WINDOW_MINUTES). */
export const UNDO_WINDOW_MS = 15 * 60_000;

/**
 * Q-44 (adviser 18-11): after a progress or QC batch is saved, «Saved — undo» for the 15 minutes the server allows, then it disappears. The undo itself is
 * the server's: a reverse save, refused whole if a villa changed after (the refusal comes back as `error`, in the page's language).
 */
export function UndoLastSave({ savedAt, onUndo, pending, error, undone }: { savedAt: number; onUndo: () => void; pending: boolean; error: string | null; undone: boolean }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { saved: "حُفظ.", undo: "تراجع عن هذا الحفظ", undone: "تم التراجع عن الحفظ؛ عادت الفلل إلى حالتها قبله.", hint: "متاح 15 دقيقة من الحفظ، لصاحبه وحده، ما لم تتغيّر فلة بعده." },
    en: { saved: "Saved.", undo: "Undo this save", undone: "The save was undone; the villas are back to what they were before it.", hint: "Available for 15 minutes after the save, to whoever saved it, unless a villa changed after it." },
    ur: { saved: "محفوظ ہو گیا۔", undo: "یہ محفوظ کاری واپس لیں", undone: "محفوظ کاری واپس لے لی گئی؛ ولاز اپنی پچھلی حالت پر واپس آ گئے۔", hint: "محفوظ کرنے کے 15 منٹ تک، صرف محفوظ کرنے والے کے لیے، جب تک اس کے بعد کوئی ولا نہ بدلے۔" },
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  if (undone) return <p role="status" data-undo-done className="text-sm text-success-soft-foreground">{t.undone}</p>;
  if (now - savedAt > UNDO_WINDOW_MS) return null;
  return (
    <div data-undo-last-save className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3"><span>{t.saved}</span><Button variant="secondary" className="min-h-11" loading={pending} onClick={onUndo}>{t.undo}</Button></div>
      <p className="text-xs text-muted-foreground">{t.hint}</p>
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    </div>
  );
}
