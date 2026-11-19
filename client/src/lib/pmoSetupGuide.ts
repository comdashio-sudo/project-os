// Q-37 (a, P1-04): what the portfolio / program / project setup on the PMO board means, field by field, in the three languages. Every sentence says what
// the server does (server/db.ts createPortfolioForTenant, createProgramForTenant, linkProjectToProgramForTenant) — nothing here changes a relation.
// The examples are made up (no real company, project or client).
export type Lang = "ar" | "en" | "ur";
type Text = Record<Lang, string>;
export type FieldHelp = { required: boolean; text: Text };

export const PMO_SETUP_GUIDE = {
  levels: [
    { key: "portfolio", name: { ar: "المحفظة (Portfolio)", en: "Portfolio", ur: "پورٹ فولیو" }, text: { ar: "أعلى مستوى: مجموعة برامج ومشاريع تُدار معًا لهدف واحد للشركة، مثل كل مشاريع السكن.", en: "The top level: programs and projects managed together for one company goal, such as all housing work.", ur: "سب سے اوپر کی سطح: پروگرام اور منصوبے جو کمپنی کے ایک مقصد کے لیے اکٹھے چلائے جاتے ہیں، جیسے رہائش کے تمام منصوبے۔" } },
    { key: "program", name: { ar: "البرنامج (Program)", en: "Program", ur: "پروگرام" }, text: { ar: "مشاريع مترابطة تُتابع معًا، كمراحل حيّ واحد. يتبع محفظة أو يبقى مستقلًا.", en: "Related projects followed together, such as the phases of one district. It belongs to a portfolio or stands alone.", ur: "باہم مربوط منصوبے جو اکٹھے دیکھے جاتے ہیں، جیسے ایک محلے کے مراحل۔ کسی پورٹ فولیو کے تحت یا الگ۔" } },
    { key: "project", name: { ar: "المشروع (Project)", en: "Project", ur: "منصوبہ" }, text: { ar: "العمل الفعلي بعقده وجدوله وموقعه. يُنشأ من «سجل المشاريع»، ويُربط هنا ببرنامج أو محفظة.", en: "The actual work with its contract, schedule and site. It is created in the project registry and linked here to a program or portfolio.", ur: "اصل کام اپنے معاہدے، شیڈول اور سائٹ کے ساتھ۔ یہ «پروجیکٹ رجسٹر» میں بنتا ہے اور یہاں کسی پروگرام یا پورٹ فولیو سے جوڑا جاتا ہے۔" } },
  ],
  example: { ar: "مثال وهمي: محفظة «PF-HOUSING · مشاريع السكن» ← برنامج «PG-NORTH · حي الشمال» ← مشروعا «N-01 فلل المرحلة الأولى» و«N-02 فلل المرحلة الثانية».", en: "A made-up example: portfolio «PF-HOUSING · Housing» → program «PG-NORTH · North district» → projects «N-01 Villas phase 1» and «N-02 Villas phase 2».", ur: "فرضی مثال: پورٹ فولیو «PF-HOUSING · رہائش» ← پروگرام «PG-NORTH · شمالی محلہ» ← منصوبے «N-01 ولاز مرحلہ 1» اور «N-02 ولاز مرحلہ 2»۔" },
  fields: {
    code: { required: true, text: { ar: "رمز قصير فريد في الشركة (مثل PF-HOUSING). يُحفظ بالأحرف الكبيرة، ولا يُقبل رمز مستعمل.", en: "A short code, unique in the company (such as PF-HOUSING). It is saved in capitals; a code already in use is refused.", ur: "ایک مختصر کوڈ جو کمپنی میں منفرد ہو (جیسے PF-HOUSING)۔ بڑے حروف میں محفوظ ہوتا ہے؛ استعمال شدہ کوڈ قبول نہیں۔" } },
    name: { required: true, text: { ar: "الاسم الذي يظهر في اللوحات والتقارير.", en: "The name shown on the boards and in the reports.", ur: "وہ نام جو بورڈز اور رپورٹس میں دکھتا ہے۔" } },
    programPortfolio: { required: false, text: { ar: "اختياري: المحفظة التي يتبعها البرنامج. اتركه فارغًا لبرنامج مستقل.", en: "Optional: the portfolio the program belongs to. Leave it empty for a stand-alone program.", ur: "اختیاری: وہ پورٹ فولیو جس کے تحت پروگرام ہے۔ الگ پروگرام کے لیے خالی چھوڑیں۔" } },
    linkProject: { required: true, text: { ar: "المشروع الذي تربطه. الربط يستبدل ربطه السابق.", en: "The project to link. Linking replaces its previous link.", ur: "وہ منصوبہ جسے جوڑنا ہے۔ جوڑنا پچھلا ربط بدل دیتا ہے۔" } },
    linkProgram: { required: false, text: { ar: "اختياري. إن اخترت برنامجًا يتبع محفظة وتركت المحفظة فارغة، يأخذ المشروع محفظة البرنامج.", en: "Optional. If you choose a program that belongs to a portfolio and leave the portfolio empty, the project takes the program's portfolio.", ur: "اختیاری۔ اگر آپ ایسا پروگرام چنیں جو کسی پورٹ فولیو کے تحت ہو اور پورٹ فولیو خالی چھوڑیں تو منصوبہ پروگرام کا پورٹ فولیو لے لیتا ہے۔" } },
    linkPortfolio: { required: false, text: { ar: "اختياري. محفظة تخالف محفظة البرنامج المختار تُرفض. وترك البرنامج والمحفظة فارغين يفكّ ربط المشروع.", en: "Optional. A portfolio other than the chosen program's is refused. Leaving both program and portfolio empty unlinks the project.", ur: "اختیاری۔ منتخب پروگرام کے پورٹ فولیو سے مختلف پورٹ فولیو مسترد ہوتا ہے۔ پروگرام اور پورٹ فولیو دونوں خالی چھوڑنے سے منصوبے کا ربط ختم ہو جاتا ہے۔" } },
  } satisfies Record<string, FieldHelp>,
  required: { ar: "إلزامي", en: "Required", ur: "لازمی" },
  optional: { ar: "اختياري", en: "Optional", ur: "اختیاری" },
  title: { ar: "المحفظة والبرنامج والمشروع: ما الفرق؟", en: "Portfolio, program and project: what is the difference?", ur: "پورٹ فولیو، پروگرام اور منصوبہ: فرق کیا ہے؟" },
} as const;
export type PmoSetupField = keyof typeof PMO_SETUP_GUIDE.fields;
