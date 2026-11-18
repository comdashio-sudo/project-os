# مراجعة نظام المستودع (Q-41، P2-05)

الحالة على `main` في 2026-11-18. المراجعة من الكود والاختبارات القائمة، مع اختبار جديد للاتساق والصرف فوق المتاح. **لا نظام موازٍ، ولا تغيير في الحركات أو الأرصدة في هذا البند.**

## 1. جدول المطابقة

| العملية | الشاشة | الخادم (الإجراء ← الدالة) | الحالة | الدليل |
|---|---|---|---|---|
| استلام على المستودع | `ProjectWarehouses.tsx` | `warehouses.recordInventory` (receipt) ← `recordWarehouseInventoryTransactionForTenant` | يعمل | `stock.valuation.database.test.ts` |
| استلام مقابل أمر شراء (GRN) | `ProjectGoodsReceipts.tsx`، الإدخال الميداني | `goodsReceipts.create`، `fieldEntry` | يعمل — يرفض ما يتجاوز الالتزام | `receipt.field.database.test.ts` |
| صرف لبند WBS | `ProjectWarehouses.tsx` | `warehouses.issueToWork` ← `createMaterialIssueForTenant` | يعمل — يرفض فوق المتاح | `warehouseConsistency.database.test.ts` (جديد) |
| صرف لنشاط فيلا (الجوال) | `QuickIssue.tsx` | `warehouses.issueToCell` ← الدالة نفسها | يعمل — الرفض نفسه | `warehouse.operations.database.test.ts` |
| صرف/تسوية يدوية | `ProjectWarehouses.tsx` | `warehouses.recordInventory` (issue / adjustment، التسوية بسبب إلزامي) | يعمل — يرفض فوق المتاح | الاختبار الجديد |
| إرجاع من الصرف | — | `warehouses.returnToWarehouse` | يعمل — لا يتجاوز المصروف | `warehouse.operations.database.test.ts` |
| تحويل بين مستودعين في المشروع | `ProjectWarehouses.tsx` | `warehouses.transferInventory` (سبب إلزامي) | يعمل — يرفض فوق المتاح، والقيمة تنتقل | الاختبار الجديد، `stock.valuation` |
| تحويل بين مشروعين | — | `warehouses.transferBetweenProjects` | يعمل — يلزم الحق على المشروعين | `warehouse.operations.database.test.ts` |
| جرد سريع (عدّ ← تسوية فورية) | — | `warehouses.stocktake` ← `recordStocktakeForTenant` | يعمل | `warehouse.operations.database.test.ts` |
| جرد باعتماد شخص ثانٍ | `ProjectStocktakes.tsx` | `stocktakes.open/count/approve` | يعمل — المعتمِد غير الفاتح | `stocktakes.database.test.ts` |
| الأرصدة | `ProjectWarehouses.tsx`، `LevelWarehouse.tsx` | `warehouses.list` (balances من مجموع الحركات) | يعمل — متسق | الاختبار الجديد |
| تتبع الحركات | `ProjectWarehouses.tsx` | `warehouses.list` (transactions)، سجل التدقيق | يعمل | — |
| طلب المواد (MR) | `ProjectProcurement.tsx` | `procurement.createRequisition/transitionRequisition`، والصرف مقابله (`requisitionId`) | **قيد الإصلاح في Q-32** (المبرمج ب) | — |
| حدّ إعادة الطلب | لوحة PMO | `projectMaterialOverrides.reorderLevel` | يعمل (عرض) | — |

## 2. ما ثبت في هذا البند

`server/warehouseConsistency.database.test.ts` (2):
- بعد استلام 100 وتحويل 30 وصرف 25 لـWBS وتسوية −5: **كل رصيد معروض = مجموع حركاته** (45 في الأول و25 في الثاني).
- الصرف لـWBS، والتحويل، والصرف اليدوي، والتسوية فوق المتاح: كلها ترفض بـ`PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK`، **ولا حركة تُكتب**، والأرصدة تبقى متسقة.

الحركات تُكتب بعد قفل صف المستودع (`FOR UPDATE`)، فلا يتجاوز صرفان متزامنان المتاح.

## 3. ما ينقص أو يحتاج قرارًا

| البند | الملاحظة | المقترح |
|---|---|---|
| مساران للجرد | «الجرد السريع» (`warehouses.stocktake`) يسوّي فورًا بيد شخص واحد، **ولا تستدعيه أي شاشة** (فحص `client/src`)؛ المستخدم يرى «الجرد بالاعتماد» وحده | **قرار:** إبقاؤه للخادم وحده أو إزالته؛ لم يُغيَّر شيء |
| طلب المواد | العطل المبلّغ في Q-32 | يتولاه المبرمج ب |
| طلب مستقبلي بتاريخ حاجة | غير موجود | تصور Q-42 (المبرمج ب)؛ لا حجز ولا خصم قبل قاعدة معتمدة |
| شاشة للإرجاع والتحويل بين المشاريع | الخادم موجود ومختبر، **ولا تستدعيه أي شاشة** (فحص `client/src`) | دفعة واجهة صغيرة: زر «إرجاع» على سطر الصرف، و«تحويل إلى مشروع آخر» في المستودع |

لا عطل واضحًا في الحركات والأرصدة يستدعي إصلاحًا الآن.
