import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { SetPassword } from "./SetPassword";

// D-83: on the profile, a person who signs in with the mailed code can set a password (or change it) on the same path as «forgot the password» (#241):
// a code to their own address, then the code with the new password. The address is the signed-in one and cannot be changed here.
const text = {
  ar: { title: "كلمة المرور", hint: "طريقة دخول ثانية بجانب الرمز: عيّن كلمة مرور لتدخل بالبريد وكلمتك. نرسل رمزًا إلى بريدك للتأكيد.", start: "عيّن كلمة مرور أو غيّرها", cancel: "إلغاء", done: "حُفظت كلمة المرور. تستطيع الدخول بها من الآن." },
  en: { title: "Password", hint: "A second way in beside the code: set a password to sign in with your e-mail and it. We send a code to your e-mail to confirm.", start: "Set or change a password", cancel: "Cancel", done: "The password is saved. You can sign in with it from now on." },
  ur: { title: "پاس ورڈ", hint: "کوڈ کے ساتھ لاگ ان کا دوسرا طریقہ: پاس ورڈ مقرر کریں تاکہ ای میل اور پاس ورڈ سے لاگ ان کر سکیں۔ تصدیق کے لیے ہم آپ کے ای میل پر کوڈ بھیجتے ہیں۔", start: "پاس ورڈ مقرر کریں یا بدلیں", cancel: "منسوخ کریں", done: "پاس ورڈ محفوظ ہو گیا۔ اب آپ اس سے لاگ ان کر سکتے ہیں۔" },
};

export function OwnPasswordCard({ email }: { email: string | null | undefined }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (!email) return null;
  return (
    <Card data-own-password>
      <CardHeader><CardTitle>{t.title}</CardTitle><CardDescription>{t.hint}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {done ? <p role="status" className="text-sm font-medium">{t.done}</p> : null}
        {open ? (
          <SetPassword initialEmail={email} fixedEmail onDone={() => { setOpen(false); setDone(true); }}>
            <Button className="min-h-11" type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
          </SetPassword>
        ) : <Button className="min-h-11" type="button" variant="outline" onClick={() => { setDone(false); setOpen(true); }}>{t.start}</Button>}
      </CardContent>
    </Card>
  );
}
