# قاعدة بيانات PROJECT OS

## قواعد النمذجة

تستخدم النواة مفاتيح UUID، طوابع زمنية UTC، علاقات خارجية، قيودًا وفهارس مناسبة. كل سجل أعمال يحتوي `tenantId` ويُقيد بالعضوية والاستحقاق في طبقة الخدمات قبل القراءة أو الكتابة.

## نطاقات البيانات

| النطاق | كيانات البداية |
|---|---|
| الهوية والمؤسسة | companies، users، memberships، roles، permissions، audit_logs |
| التجارة والاستحقاق | subscriptions، entitlements، product_packages |
| الهيكل والحوكمة | portfolios، programs، projects، project_types، lifecycle_gates |
| ضوابط المشروع | wbs_items، activities، budgets، costs، commitments، progress_entries، evm_snapshots |
| التحكم والتنفيذ | risks، issues، actions، decisions، workflows، documents، notifications |

## سياسة العزل

لا يسمح لأي استعلام متعلق بالعمل أن يُنفذ دون فلتر `tenantId` موثق. ستغطي اختبارات العزل الوصول العرضي بين المستأجرين، وIDOR، وتجاوز الدور، وتجاوز الاستحقاق.

