// Q-37 (c, P2-10): what each PMC tab is for, when to open it, what it reads and what it gives — the 14 tabs of client/src/pages/ProjectPmc.tsx, in the
// three languages. Each sentence describes what the screen already computes (server/domain/pmcScreens.ts); nothing here adds a screen or a figure.
type Text = { ar: string; en: string; ur: string };
export type PmcTabHelp = { what: Text; when: Text };

export const PMC_TAB_GUIDE = {
  board: {
    what: { ar: "لوحة تقدّم الفلل: الإنجاز الفعلي، والمخطط حتى اليوم والفرق وSPI حين يوجد برنامج زمني مستورد، ومستهدف نهاية الشهر والمطلوب أسبوعيًا، وخريطة لكل الفلل ملوّنة بالإنجاز أو بزيادة هذا الشهر أو بالنموذج.", en: "The villas' progress board: actual progress; planned to date, variance and SPI when an imported programme exists; the month-end target and the weekly pace needed; and a map of every villa coloured by progress, this month's increase or model.", ur: "ولاز کی پیش رفت کا بورڈ: اصل پیش رفت؛ درآمد شدہ پروگرام ہو تو آج تک منصوبہ بند، فرق اور SPI؛ مہینے کے آخر کا ہدف اور ہفتہ وار درکار رفتار؛ اور ہر ولا کا نقشہ، پیش رفت، اس مہینے کے اضافے یا ماڈل کے رنگ میں۔" },
    when: { ar: "لرؤية المشروع كله من نظرة واحدة، ولفتح بطاقة أي فيلا من الخريطة.", en: "To see the whole project at a glance, and to open any villa's card from the map.", ur: "پورے منصوبے کو ایک نظر میں دیکھنے اور نقشے سے کسی بھی ولا کا کارڈ کھولنے کے لیے۔" },
  },
  latestUpdates: {
    what: { ar: "من حدّث الإنجاز ومتى: لكل مهندس عدد تحديثاته وأيام عمله، والنسبة التي أضافها إلى إنجاز المشروع، موزعة على المجموعات.", en: "Who updated progress and when: per engineer, the number of updates, the active days, and the share each added to the project's progress, by group.", ur: "کس نے پیش رفت کب اپ ڈیٹ کی: ہر انجینئر کے اپ ڈیٹس، فعال دن، اور منصوبے کی پیش رفت میں اس کا اضافہ، گروپ کے لحاظ سے۔" },
    when: { ar: "لمتابعة نشاط الفريق اليومي.", en: "To follow the team's daily activity.", ur: "ٹیم کی روزانہ سرگرمی دیکھنے کے لیے۔" },
  },
  approvals: {
    what: { ar: "طلبات الفحص المرسلة للاستشاري وردوده: لكل استشاري ولكل يوم ولكل نشاط، كم اعتُمد وكم رُفض وكم ينتظر.", en: "Inspection requests sent to the consultant and the replies: per consultant, per day and per activity, how many were approved, rejected or are waiting.", ur: "کنسلٹنٹ کو بھیجی گئی معائنہ درخواستیں اور جوابات: ہر کنسلٹنٹ، ہر دن اور ہر سرگرمی کے لحاظ سے منظور، مسترد یا منتظر۔" },
    when: { ar: "قبل اجتماع الاستشاري، أو لمعرفة أين يتأخر الرد.", en: "Before the consultant meeting, or to see where replies lag.", ur: "کنسلٹنٹ میٹنگ سے پہلے، یا یہ جاننے کے لیے کہ جواب کہاں رکا ہے۔" },
  },
  sitePlan: {
    what: { ar: "المخطط بالفلل ملوّنة حسب حالة نشاط تختاره أو حسب الإنجاز الكلي، وبطاقة كل فيلا.", en: "The plan with the villas coloured by the status of an activity you choose, or by overall progress, and each villa's card.", ur: "نقشہ جس میں ولاز آپ کی منتخب سرگرمی کی حالت یا مجموعی پیش رفت کے لحاظ سے رنگین ہیں، اور ہر ولا کا کارڈ۔" },
    when: { ar: "لرؤية الموقع كله دفعة واحدة.", en: "To see the whole site at once.", ur: "پوری سائٹ ایک نظر میں دیکھنے کے لیے۔" },
  },
  programme: {
    what: { ar: "البرنامج الزمني من خط الأساس المستورد: المخطط مقابل الفعلي لكل نشاط.", en: "The programme from the imported baseline: planned against actual per activity.", ur: "درآمد شدہ بیس لائن سے پروگرام: ہر سرگرمی کا منصوبہ بمقابلہ اصل۔" },
    when: { ar: "لمعرفة المتأخر عن الخطة. يحتاج استيراد «خط الأساس» أولًا.", en: "To find what is behind the plan. It needs the «baseline» import first.", ur: "منصوبے سے پیچھے رہ جانے والا کام جاننے کے لیے۔ پہلے «بیس لائن» درآمد ضروری ہے۔" },
  },
  inspections: {
    what: { ar: "مسار الفحوصات: كم طلبًا في كل مرحلة، ومن يحتجزها، والأنشطة التي توقفت عند الفحص.", en: "The inspection flow: how many requests are at each stage, who holds them, and the activities stuck at inspection.", ur: "معائنے کا سلسلہ: ہر مرحلے میں کتنی درخواستیں، کس کے پاس رکی ہیں، اور معائنے پر رکی سرگرمیاں۔" },
    when: { ar: "لفك اختناقات الفحص.", en: "To clear inspection bottlenecks.", ur: "معائنے کی رکاوٹیں دور کرنے کے لیے۔" },
  },
  activities: {
    what: { ar: "مصفوفة الأنشطة: لكل مجموعة ونشاط، عدد الوحدات ووزنها في كل حالة.", en: "The activities matrix: per group and activity, the number of units and their weight in each status.", ur: "سرگرمیوں کا میٹرکس: ہر گروپ اور سرگرمی کے لیے ہر حالت میں یونٹس کی تعداد اور ان کا وزن۔" },
    when: { ar: "لمعرفة أين يقف كل نشاط في المشروع كله.", en: "To see where each activity stands across the project.", ur: "یہ دیکھنے کے لیے کہ ہر سرگرمی پورے منصوبے میں کہاں ہے۔" },
  },
  zones: {
    what: { ar: "الإنجاز حسب المنطقة والمرحلة ومهندسها: الخلايا المكتملة والوزن المكتمل.", en: "Progress by zone, stage and its engineer: the complete cells and the complete weight.", ur: "زون، مرحلے اور اس کے انجینئر کے لحاظ سے پیش رفت: مکمل خانے اور مکمل وزن۔" },
    when: { ar: "لمقارنة المناطق ومهندسيها.", en: "To compare the zones and their engineers.", ur: "زونز اور ان کے انجینئرز کا موازنہ کرنے کے لیے۔" },
  },
  weekly: {
    what: { ar: "لكل أسبوع: عدد التحديثات والنسبة المضافة إلى الإنجاز، حسب المجموعة والمهندس.", en: "Per week: the number of updates and the share added to progress, by group and engineer.", ur: "ہر ہفتے: اپ ڈیٹس کی تعداد اور پیش رفت میں اضافہ، گروپ اور انجینئر کے لحاظ سے۔" },
    when: { ar: "لإيقاع الأسبوع. التقرير الأسبوعي المكتوب صفحة مستقلة.", en: "For the week's pace. The written weekly report is a separate page.", ur: "ہفتے کی رفتار کے لیے۔ تحریری ہفتہ وار رپورٹ الگ صفحہ ہے۔" },
  },
  monthly: {
    what: { ar: "مثل «الأسبوعي» لكن لكل شهر.", en: "Like «Weekly», per month.", ur: "«ہفتہ وار» جیسا، مگر ہر مہینے کے لیے۔" },
    when: { ar: "للمقارنة بين الأشهر.", en: "To compare months.", ur: "مہینوں کا موازنہ کرنے کے لیے۔" },
  },
  pending: {
    what: { ar: "ما ينتظر عند المُحقِّق، بأعمار الانتظار (أيام) وكل طلب.", en: "What waits at the verifier, by waiting age (days), with each item.", ur: "تصدیق کنندہ کے پاس جو منتظر ہے، انتظار کی مدت (دن) اور ہر آئٹم کے ساتھ۔" },
    when: { ar: "لمتابعة الأقدم أولًا.", en: "To chase the oldest first.", ur: "سب سے پرانے کو پہلے نمٹانے کے لیے۔" },
  },
  stages: {
    what: { ar: "لكل مرحلة: الوحدات في كل حالة، والأنشطة المتأخرة عن خط الأساس.", en: "Per stage: the units in each status, and the activities behind the baseline.", ur: "ہر مرحلے کے لیے: ہر حالت میں یونٹس، اور بیس لائن سے پیچھے سرگرمیاں۔" },
    when: { ar: "لمعرفة أي مرحلة تتأخر.", en: "To see which stage is falling behind.", ur: "یہ جاننے کے لیے کہ کون سا مرحلہ پیچھے ہے۔" },
  },
  editors: {
    what: { ar: "إدخال الوحدات وأوزان الأنشطة (حتى 100% لكل نموذج) ومصفوفة الحالة يدويًا. يحتاج صلاحية إدارة PMC.", en: "Entering the units, the activity weights (up to 100% per model) and the status matrix by hand. It needs the PMC management permission.", ur: "یونٹس، سرگرمیوں کے وزن (ہر ماڈل کے لیے 100% تک) اور حالت کا میٹرکس ہاتھ سے درج کرنا۔ PMC انتظام کی اجازت درکار ہے۔" },
    when: { ar: "عند إعداد المشروع أو تصحيح وزن.", en: "When setting the project up or correcting a weight.", ur: "منصوبہ ترتیب دیتے وقت یا وزن درست کرتے وقت۔" },
  },
  import: {
    what: { ar: "استيراد ملفات PMC (الوحدات، الأوزان، الحالة، خط الأساس…) مع دليل كل قالب وحالة كل نوع من الاستيراد المحفوظ.", en: "Importing PMC files (units, weights, status, baseline…), with each template's guide and each kind's state from the saved imports.", ur: "PMC فائلیں درآمد کرنا (یونٹس، وزن، حالت، بیس لائن…)، ہر سانچے کی رہنمائی اور محفوظ درآمد سے ہر قسم کی حالت کے ساتھ۔" },
    when: { ar: "أول مرة، ثم كلما وصل ملف محدَّث.", en: "The first time, then whenever an updated file arrives.", ur: "پہلی بار، پھر جب بھی تازہ فائل آئے۔" },
  },
} as const satisfies Record<string, PmcTabHelp>;

/** What the PMC pages do NOT have (decided, not missing by accident): said once so nobody looks for it. */
export const PMC_NOT_IN_PLATFORM: Text = {
  ar: "غير موجود في المنصة بقرار: مزامنة Google Sheets، وشاشة ثلاثية الأبعاد. البيانات تدخل بالاستيراد أو بالإدخال الميداني.",
  en: "Not in the platform, by decision: Google Sheets sync and a 3D screen. Data comes in by import or by field entry.",
  ur: "فیصلے کے تحت پلیٹ فارم میں نہیں: Google Sheets ہم آہنگی اور 3D اسکرین۔ ڈیٹا درآمد یا فیلڈ اندراج سے آتا ہے۔",
};
export const PMC_GUIDE_LABELS = {
  when: { ar: "متى", en: "When", ur: "کب" },
  all: { ar: "دليل صفحات PMC", en: "Guide to the PMC pages", ur: "PMC صفحات کی رہنمائی" },
} as const;
