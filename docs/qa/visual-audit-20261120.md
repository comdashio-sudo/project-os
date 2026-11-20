# التدقيق البصري — 2026-11-20 (Q-54)

المصدر: `scripts/visual-audit.mjs` على قاعدة الاختبار المحلية وشركة العرض المختلقة. الأدوار: owner. العروض: 390، 768، 1280، 1440. اللغات: ar، en، ur. المسارات: 28.

العيوب الحرجة (تمرير أفقي أو خطأ صفحة): **0**.

| النوع | عدد العيوب المميّزة |
|---|---|
| تمرير أفقي | 0 |
| خطأ صفحة | 0 |
| نص يخرج من مكانه | 20 |
| تباين أقل من الحد | 10 |
| هدف لمس أقل من 44px | 0 |
| خطأ في Console | 0 |

## القائمة مرتّبة بالأثر

| # | النوع | الشاشة | العنصر/التفصيل | مرات الظهور | العروض | اللغات | الأدوار |
|---|---|---|---|---|---|---|---|
| 1 | نص يخرج من مكانه | registry | p[mt-1.font-semibold] «382,356,758.44» | 40 | 390،768،1280،1440 | ar،en،ur | 1 |
| 2 | نص يخرج من مكانه | profitability | p[mt-2.text-2xl] «65,155,558.44» | 18 | 768،1280،1440 | ar،en،ur | 1 |
| 3 | تباين أقل من الحد | profile | p[text-sm.text-muted-foreground] «owner@example.test» 2.96:1 | 12 | 390،768،1280،1440 | ar،en،ur | 1 |
| 4 | نص يخرج من مكانه | commercial | p[mt-1.text-xl] «450,000,000.00 SAR» | 6 | 768 | en،ur | 1 |
| 5 | تباين أقل من الحد | profitability | p[mt-1.text-xs] «القيمة المفوترة ناقص التكلفة الفعلية (مؤشر تقريبي)» 2.91:1 | 4 | 390،768،1280،1440 | ar | 1 |
| 6 | تباين أقل من الحد | profitability | p[text-xs.text-muted-foreground] «المفوتر من BOQ» 2.91:1 | 4 | 390،768،1280،1440 | ar | 1 |
| 7 | تباين أقل من الحد | profitability | p[text-xs.text-muted-foreground] «المستخدم من BOQ» 2.91:1 | 4 | 390،768،1280،1440 | ar | 1 |
| 8 | تباين أقل من الحد | profitability | p[mt-1.text-xs] «Invoiced value minus actual cost (proxy)» 2.91:1 | 4 | 390،768،1280،1440 | en | 1 |
| 9 | تباين أقل من الحد | profitability | p[text-xs.text-muted-foreground] «BOQ billed» 2.91:1 | 4 | 390،768،1280،1440 | en | 1 |
| 10 | تباين أقل من الحد | profitability | p[text-xs.text-muted-foreground] «BOQ cost used» 2.91:1 | 4 | 390،768،1280،1440 | en | 1 |
| 11 | تباين أقل من الحد | profitability | p[mt-1.text-xs] «انوائس شدہ قدر منہا اصل لاگت (تقریبی اندازہ)» 2.91:1 | 4 | 390،768،1280،1440 | ur | 1 |
| 12 | تباين أقل من الحد | profitability | p[text-xs.text-muted-foreground] «BOQ سے بل شدہ» 2.91:1 | 4 | 390،768،1280،1440 | ur | 1 |
| 13 | تباين أقل من الحد | profitability | p[text-xs.text-muted-foreground] «BOQ سے استعمال شدہ لاگت» 2.91:1 | 4 | 390،768،1280،1440 | ur | 1 |
| 14 | نص يخرج من مكانه | schedule | div[text-xl.font-semibold] «Not available» | 4 | 768 | en | 1 |
| 15 | نص يخرج من مكانه | controls | span «EAC: 387590551.92» | 3 | 390 | ar،en،ur | 1 |
| 16 | نص يخرج من مكانه | controls | span «VAC: -7590551.92» | 3 | 390 | ar،en،ur | 1 |
| 17 | نص يخرج من مكانه | controls | span «Under investigation» | 3 | 390 | en | 1 |
| 18 | نص يخرج من مكانه | controls | p[mt-2.text-lg] «724,573.980» | 3 | 768 | ar،en،ur | 1 |
| 19 | نص يخرج من مكانه | commercial | p[mt-1.text-xl] «⁦450,000,000.00 ريال⁩» | 3 | 768 | ar | 1 |
| 20 | نص يخرج من مكانه | controls | span «منصوبے کی سطح» | 1 | 390 | ur | 1 |
| 21 | نص يخرج من مكانه | controls | span «کسی معاہدے سے منسلک نہیں» | 1 | 390 | ur | 1 |
| 22 | نص يخرج من مكانه | controls | button[inline-flex.items-center] «تسجيل الصرف والتكلفة» | 1 | 768 | ar | 1 |
| 23 | نص يخرج من مكانه | weekly | dt[text-xs.text-muted-foreground] «العمالة (رجل×يوم) · مباشرة» | 1 | 768 | ar | 1 |
| 24 | نص يخرج من مكانه | weekly | dt[text-xs.text-muted-foreground] «العمالة (رجل×يوم) · غير مباشرة» | 1 | 768 | ar | 1 |
| 25 | نص يخرج من مكانه | controls | button[inline-flex.items-center] «Post issue and cost» | 1 | 768 | en | 1 |
| 26 | نص يخرج من مكانه | weekly | dt[text-xs.text-muted-foreground] «Daily reports counted» | 1 | 768 | en | 1 |
| 27 | نص يخرج من مكانه | weekly | dt[text-xs.text-muted-foreground] «Working days» | 1 | 768 | en | 1 |
| 28 | نص يخرج من مكانه | weekly | dt[text-xs.text-muted-foreground] «Labour (man-days) · Indirect» | 1 | 768 | en | 1 |
| 29 | نص يخرج من مكانه | monthly | dt[text-xs.text-muted-foreground] «Working days» | 1 | 768 | en | 1 |
| 30 | نص يخرج من مكانه | monthly | dt[text-xs.text-muted-foreground] «Indirect labour» | 1 | 768 | en | 1 |



حدود: Chromium فقط (لا WebKit)؛ التباين يُحسب على خلفية مصمتة (يُتخطى ما فوق صورة أو تدرّج)؛ ألوان خارج الرموز يمنعها `pnpm check` لا هذا السكربت.
