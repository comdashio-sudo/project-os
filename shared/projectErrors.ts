export type BilingualMessage = {
  ar: string;
  en: string;
  /** Urdu. Where a message has no Urdu translation yet, the value is the English text, listed as open in docs/TRANSLATION_REVIEW.md. */
  ur: string;
};

export const projectErrorMessages = {
  PROJECT_OS_AUTH_REQUIRED: {
    ar: "يلزم تسجيل الدخول لمتابعة هذه العملية.",
    en: "You must sign in to continue this operation.",
    ur: "اس عمل کو جاری رکھنے کے لیے لاگ ان کرنا ضروری ہے۔",
  },
  PROJECT_OS_TENANT_ACCESS_DENIED: {
    ar: "لا تملك وصولاً إلى مساحة العمل المطلوبة.",
    en: "You do not have access to the requested workspace.",
    ur: "آپ کو مطلوبہ ورک اسپیس تک رسائی حاصل نہیں ہے۔",
  },
  PROJECT_OS_PRODUCT_NOT_ENTITLED: {
    ar: "لا تتضمن حزمة مساحة العمل هذا المستوى التشغيلي.",
    en: "This workspace package does not include the requested operating level.",
    ur: "اس ورک اسپیس پیکج میں مطلوبہ آپریشنل سطح شامل نہیں ہے۔",
  },
  PROJECT_OS_PERMISSION_DENIED: {
    ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.",
    en: "You do not have the required permission to complete this operation.",
    ur: "اس عمل کو مکمل کرنے کے لیے درکار صلاحیت آپ کے پاس نہیں ہے۔",
  },
  PROJECT_OS_SERVICE_UNAVAILABLE: {
    ar: "الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل.",
    en: "The service is temporarily unavailable. Try again shortly.",
    ur: "سروس عارضی طور پر دستیاب نہیں ہے۔ کچھ دیر بعد دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_TENANT_NOT_FOUND: {
    ar: "الشركة المطلوبة غير متاحة.",
    en: "The requested company is not available.",
    ur: "مطلوبہ کمپنی دستیاب نہیں ہے۔",
  },
  PROJECT_OS_TENANT_OWNER_REQUIRED: {
    ar: "هذه العملية لمالك الشركة وحده.",
    en: "Only the company owner can do this.",
    ur: "یہ کام صرف کمپنی کا مالک کر سکتا ہے۔",
  },
  PROJECT_OS_DELETION_EXPORT_REQUIRED: {
    ar: "نزّل نسخة من بيانات الشركة أولًا؛ لا يُسمح بالحذف النهائي إلا بعد تصدير أُجري خلال الأيام السبعة الماضية.",
    en: "Download a copy of the company's data first: permanent deletion is allowed only after an export made in the last seven days.",
    ur: "پہلے کمپنی کے ڈیٹا کی ایک نقل ڈاؤن لوڈ کریں۔ مستقل حذف صرف اس صورت میں ممکن ہے جب پچھلے سات دنوں میں ایکسپورٹ کیا گیا ہو۔",
  },
  PROJECT_OS_DELETION_CONFIRMATION_INVALID: {
    ar: "رمز تأكيد الحذف غير صالح لهذه الشركة أو لهذا المستخدم. اطلب الحذف من جديد.",
    en: "The deletion confirmation code is not valid for this company or this person. Request the deletion again.",
    ur: "اس کمپنی یا اس شخص کے لیے حذف کی تصدیق کا کوڈ درست نہیں ہے۔ حذف کی درخواست دوبارہ کریں۔",
  },
  PROJECT_OS_DELETION_CONFIRMATION_EXPIRED: {
    ar: "انتهت مهلة رمز تأكيد الحذف (15 دقيقة). اطلب الحذف من جديد.",
    en: "The deletion confirmation code has expired (15 minutes). Request the deletion again.",
    ur: "حذف کی تصدیق کے کوڈ کی مدت ختم ہو چکی ہے (15 منٹ)۔ حذف کی درخواست دوبارہ کریں۔",
  },
  PROJECT_OS_TEMPLATE_REMOVAL_NOT_PENDING: {
    ar: "هذا الاقتراح لم يعد بانتظار القرار (قُرّر سابقًا أو ليس لشركتك). حدّث الصفحة.",
    en: "This proposal is no longer waiting for a decision (it was decided already, or it is not your company's). Refresh the page.",
    ur: "یہ تجویز اب فیصلے کی منتظر نہیں (پہلے طے ہو چکی یا آپ کی کمپنی کی نہیں)۔ صفحہ تازہ کریں۔",
  },
  PROJECT_OS_DELETION_IN_PROGRESS: {
    ar: "حذف هذه الشركة جارٍ الآن في عملية أخرى. انتظر خمس دقائق ثم أعد المحاولة إن لم يكتمل.",
    en: "Deletion of this company is already running in another operation. Wait five minutes and try again if it has not finished.",
    ur: "اس کمپنی کا حذف کسی دوسرے عمل میں پہلے ہی جاری ہے۔ پانچ منٹ انتظار کریں، اور اگر وہ مکمل نہ ہوا ہو تو دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_DELETION_NAME_MISMATCH: {
    ar: "الاسم المكتوب لا يطابق اسم الشركة تمامًا. لم يُحذف شيء.",
    en: "The name you typed does not exactly match the company name. Nothing was deleted.",
    ur: "آپ کا لکھا ہوا نام کمپنی کے نام سے بالکل مطابق نہیں۔ کچھ حذف نہیں ہوا۔",
  },
  PROJECT_OS_TENANT_SCHEMA_UNCLASSIFIED: {
    ar: "تعذّر التصدير أو الحذف: في قاعدة البيانات جدول لم يُصنَّف بعد ضمن بيانات الشركة. لم يُغيَّر شيء؛ أبلغ الدعم.",
    en: "The export or deletion cannot run: the database has a table that is not yet classified as company data. Nothing was changed; contact support.",
    ur: "ایکسپورٹ یا حذف نہیں چل سکتا: ڈیٹا بیس میں ایک جدول ہے جو ابھی کمپنی کے ڈیٹا کے طور پر درجہ بند نہیں ہوا۔ کچھ تبدیل نہیں ہوا؛ سپورٹ سے رابطہ کریں۔",
  },
  PROJECT_OS_PROJECT_NOT_FOUND: {
    ar: "المشروع المطلوب غير متاح ضمن مساحة العمل هذه.",
    en: "The requested project is not available in this workspace.",
    ur: "مطلوبہ پروجیکٹ اس ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PROJECT_PROFILE_INVALID: {
    ar: "بيانات المشروع غير صالحة: تحقّق من أيام العمل، وأن بداية الدوام قبل نهايته، وأن بادئة الترقيم أحرف لاتينية كبيرة وأرقام وشرطات.",
    en: "The project details are not valid: check the working days, that the start of the working day is before its end, and that the report prefix uses capital letters, digits and hyphens.",
    ur: "پروجیکٹ کی تفصیلات درست نہیں ہیں: کام کے دن چیک کریں، یہ کہ کام کا آغاز اختتام سے پہلے ہو، اور رپورٹ کا سابقہ بڑے لاطینی حروف، ہندسوں اور ڈیش پر مشتمل ہو۔",
  },
  PROJECT_OS_PROJECT_MAIN_CONTRACTOR_EXISTS: {
    ar: "للمشروع مقاول رئيسي فعّال بالفعل. أوقف المقاول الحالي أو سجّل هذه الشركة مقاول باطن.",
    en: "The project already has an active main contractor. Deactivate the current one or add this company as a subcontractor.",
    ur: "اس پروجیکٹ کا ایک فعال مرکزی ٹھیکیدار پہلے سے موجود ہے۔ موجودہ کو غیر فعال کریں یا اس کمپنی کو ذیلی ٹھیکیدار کے طور پر شامل کریں۔",
  },
  PROJECT_OS_PROJECT_COMPANY_NOT_FOUND: {
    ar: "الشركة المطلوبة غير مسجّلة في هذا المشروع.",
    en: "The requested company is not registered on this project.",
    ur: "مطلوبہ کمپنی اس پروجیکٹ میں درج نہیں ہے۔",
  },
  PROJECT_OS_PROJECT_LOGO_TYPE_INVALID: {
    ar: "الشعار يجب أن يكون صورة PNG أو JPEG أو SVG.",
    en: "The logo must be a PNG, JPEG or SVG image.",
    ur: "لوگو PNG، JPEG یا SVG تصویر ہونا چاہیے۔",
  },
  PROJECT_OS_PROJECT_LOGO_TOO_LARGE: {
    ar: "حجم الشعار يتجاوز 2 ميغابايت.",
    en: "The logo is larger than 2 MB.",
    ur: "لوگو کا سائز 2 MB سے زیادہ ہے۔",
  },
  PROJECT_OS_PROJECT_LOGO_UNSAFE: {
    ar: "ملف SVG يحتوي على شيفرة أو روابط تنفيذية، فلا يُقبل شعارًا. احفظه من جديد صورةً بسيطة أو استعمل PNG.",
    en: "The SVG file contains script or active links, so it is not accepted as a logo. Save it again as a plain image, or use PNG.",
    ur: "SVG فائل میں اسکرپٹ یا فعال روابط ہیں، اس لیے اسے لوگو کے طور پر قبول نہیں کیا جاتا۔ اسے سادہ تصویر کے طور پر دوبارہ محفوظ کریں یا PNG استعمال کریں۔",
  },
  PROJECT_OS_WBS_SCOPE_MISMATCH: {
    ar: "بند WBS المحدد لا يتبع للمشروع المطلوب.",
    en: "The selected WBS item does not belong to the requested project.",
    ur: "منتخب کردہ WBS آئٹم مطلوبہ پروجیکٹ سے تعلق نہیں رکھتا۔",
  },
  PROJECT_OS_ACTIVITY_SCHEDULE_INVALID: {
    ar: "لا يمكن أن يسبق تاريخ نهاية النشاط تاريخ بدايته المخطط.",
    en: "An activity's planned finish date cannot be earlier than its planned start date.",
    ur: "کسی سرگرمی کی منصوبہ بند اختتامی تاریخ اس کی منصوبہ بند ابتدائی تاریخ سے پہلے نہیں ہو سکتی۔",
  },
  PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN: {
    ar: "لا يمكنك تعديل عضويتك أو امتيازاتك من خلال هذا المسار.",
    en: "You cannot change your own membership or privileges through this path.",
    ur: "آپ اس راستے سے اپنی رکنیت یا اپنی صلاحیتیں تبدیل نہیں کر سکتے۔",
  },
  PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID: {
    ar: "انتقال حالة العضوية المطلوب غير مسموح.",
    en: "The requested membership status transition is not allowed.",
    ur: "رکنیت کی درخواست کردہ حیثیت کی تبدیلی کی اجازت نہیں ہے۔",
  },
  PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN: {
    ar: "لا يمكن تعطيل آخر مالك نشط للمؤسسة.",
    en: "The last active tenant owner cannot be deactivated.",
    ur: "آخری فعال کمپنی مالک کو غیر فعال نہیں کیا جا سکتا۔",
  },
  PROJECT_OS_INVALID_SCOPE: {
    ar: "حدد نطاقًا صالحًا للدور المطلوب إسناده.",
    en: "Select a valid scope for the role assignment.",
    ur: "کردار کی تفویض کے لیے درست دائرہ منتخب کریں۔",
  },
  PROJECT_OS_USER_NOT_FOUND: {
    ar: "لا يمكن العثور على المستخدم المحدد.",
    en: "The selected user could not be found.",
    ur: "منتخب کردہ صارف نہیں ملا۔",
  },
  PROJECT_OS_ROLE_NOT_FOUND: {
    ar: "الدور المحدد غير متاح ضمن هذه الشركة.",
    en: "The selected role is not available in this organization.",
    ur: "منتخب کردہ کردار اس تنظیم میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_ROLE_CODE_EXISTS: {
    ar: "رمز الدور مستخدم بالفعل ضمن هذه الشركة.",
    en: "This role code is already in use in this organization.",
    ur: "یہ کردار کا کوڈ اس تنظیم میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_INVALID_ROLE_PERMISSIONS: {
    ar: "يجب أن تنتمي جميع الصلاحيات المختارة إلى منتج الدور المحدد وأن تكون موجودة في الكتالوج.",
    en: "Every selected permission must exist in the catalog and belong to the selected role product.",
    ur: "منتخب کردہ ہر صلاحیت کیٹلاگ میں موجود ہونی چاہیے اور منتخب کردہ کردار کی پروڈکٹ سے تعلق رکھتی ہو۔",
  },
  PROJECT_OS_SYSTEM_ROLE_IMMUTABLE: {
    ar: "لا يمكن تعديل دور يديره النظام.",
    en: "A system-managed role cannot be modified.",
    ur: "سسٹم کے زیرِ انتظام کردار میں ترمیم نہیں کی جا سکتی۔",
  },
  PROJECT_OS_MEMBER_NOT_FOUND: {
    ar: "العضوية المحددة غير متاحة ضمن هذه الشركة.",
    en: "The selected membership is not available in this organization.",
    ur: "منتخب کردہ رکنیت اس تنظیم میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_ROLE_ASSIGNMENT_EXISTS: {
    ar: "الدور والنطاق المحددان مسندان بالفعل إلى هذه العضوية.",
    en: "This role and scope are already assigned to the selected membership.",
    ur: "یہ کردار اور دائرہ منتخب کردہ رکنیت کو پہلے ہی تفویض کیا جا چکا ہے۔",
  },
  PROJECT_OS_TIME_ENTRY_INVALID: {
    ar: "ساعات العمل بين صفر و24 ساعة، ونسبة التقدم بين 0 و100.",
    en: "Hours worked must be above zero and at most 24, and progress between 0 and 100.",
    ur: "کام کے گھنٹے صفر سے زیادہ اور زیادہ سے زیادہ 24 ہوں، اور پیش رفت 0 اور 100 کے درمیان ہو۔",
  },
  PROJECT_OS_TIME_ENTRY_ASSIGNMENT_INVALID: {
    ar: "الإسناد غير متاح أو لا يغطي هذا اليوم.",
    en: "The assignment is not available or does not cover that day.",
    ur: "یہ تفویض دستیاب نہیں ہے یا اس دن پر لاگو نہیں ہوتی۔",
  },
  PROJECT_OS_CLIENT_REQUEST_REUSED: {
    ar: "معرّف الطلب مستخدم لعملية أخرى. أعد المحاولة من البداية.",
    en: "That request identifier belongs to a different operation. Start the entry again.",
    ur: "یہ درخواست کا شناختی نمبر کسی دوسرے عمل کا ہے۔ اندراج دوبارہ شروع کریں۔",
  },
  PROJECT_OS_CLIENT_REQUEST_IN_PROGRESS: {
    ar: "هذا الطلب قيد التنفيذ أو لم يُعرف مآله. تحقق من السجل قبل إعادة الإرسال.",
    en: "This request is still running, or its outcome is not known. Check the record before sending it again.",
    ur: "یہ درخواست ابھی جاری ہے، یا اس کا نتیجہ معلوم نہیں۔ دوبارہ بھیجنے سے پہلے ریکارڈ دیکھ لیں۔",
  },
  PROJECT_OS_TEAM_ENTRIES_COUNT_INVALID: {
    ar: "أدخل ساعات موظف واحد على الأقل، وبحد أقصى 200 في المرة الواحدة.",
    en: "Enter the hours of at least one person, and no more than 200 at a time.",
    ur: "کم از کم ایک فرد کے گھنٹے درج کریں، اور ایک وقت میں 200 سے زیادہ نہیں۔",
  },
  PROJECT_OS_TEAM_ENTRY_DUPLICATE: {
    ar: "الإسناد نفسه مكرر في الورقة.",
    en: "The same assignment appears twice on the sheet.",
    ur: "شیٹ میں ایک ہی تفویض دو بار آئی ہے۔",
  },
  PROJECT_OS_INVOICE_NOT_FOUND: {
    ar: "الفاتورة المطلوبة غير متاحة ضمن هذا المشروع.",
    en: "The requested invoice is not available in this project.",
    ur: "درخواست کردہ انوائس اس پروجیکٹ میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_INVOICE_TRANSITION_INVALID: {
    ar: "لا يمكن نقل الفاتورة إلى هذه الحالة من حالتها الحالية: المسودة تصدر أو تلغى، والصادرة تُسدَّد أو تلغى، والمسدَّدة لا تتغير.",
    en: "The invoice cannot move to that status from its current one: a draft is issued or voided, an issued invoice is paid or voided, a paid invoice does not change.",
    ur: "انوائس اپنی موجودہ حیثیت سے اس حیثیت میں نہیں جا سکتی۔ مسودہ جاری یا منسوخ ہو سکتا ہے، جاری انوائس ادا شدہ یا منسوخ ہو سکتی ہے، اور ادا شدہ انوائس تبدیل نہیں ہوتی۔",
  },
  PROJECT_OS_INVOICE_PAID_DATE_INVALID: {
    ar: "تاريخ السداد لا يسبق تاريخ الفاتورة ولا يكون في المستقبل البعيد.",
    en: "The payment date cannot be before the invoice date or far in the future.",
    ur: "ادائیگی کی تاریخ انوائس کی تاریخ سے پہلے یا بہت دور مستقبل میں نہیں ہو سکتی۔",
  },
  PROJECT_OS_LABOUR_SETTINGS_INVALID: {
    ar: "إعدادات التكلفة غير صالحة: نسب موجبة معقولة، ساعات اليوم بين 1 و24، ويوم عمل واحد على الأقل بلا تكرار.",
    en: "The cost settings are not valid: sensible positive rates, 1 to 24 hours a day, and at least one working day with no repeats.",
    ur: "لاگت کی ترتیبات درست نہیں: شرحیں مثبت اور معقول ہوں، روزانہ 1 سے 24 گھنٹے، اور کم از کم ایک کام کا دن ہو جس میں دہرائے بغیر اندراج ہو۔",
  },
  PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT: {
    ar: "لا يمكن جمع هذين الدورين المتعارضين للمستخدم نفسه ضمن نطاق متداخل.",
    en: "The same user cannot hold these conflicting roles in overlapping scopes.",
    ur: "ایک ہی صارف آپس میں متصادم یہ کردار ایک ساتھ ایسے دائروں میں نہیں رکھ سکتا جو آپس میں ملتے ہوں۔",
  },
  PROJECT_OS_EMPLOYEE_NOT_FOUND: {
    ar: "بطاقة الموظف المحددة غير متاحة ضمن مساحة العمل الحالية.",
    en: "The selected employee record is unavailable in the current workspace.",
    ur: "منتخب کردہ ملازم کا ریکارڈ موجودہ ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_EMPLOYEE_NUMBER_EXISTS: {
    ar: "الرقم الوظيفي مستخدم بالفعل ضمن مساحة العمل هذه.",
    en: "This employee number is already in use in this workspace.",
    ur: "یہ ملازم نمبر اس ورک اسپیس میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_EMPLOYEE_LINKED_USER_INVALID: {
    ar: "يمكن ربط بطاقة الموظف بحساب عضو في مساحة العمل فقط.",
    en: "An employee record can only be linked to a workspace member account.",
    ur: "ملازم کا ریکارڈ صرف ورک اسپیس کے رکن کے اکاؤنٹ سے جوڑا جا سکتا ہے۔",
  },
  PROJECT_OS_EMPLOYEE_LINKED_USER_EXISTS: {
    ar: "الحساب المحدد مرتبط بالفعل ببطاقة موظف ضمن مساحة العمل.",
    en: "The selected account is already linked to an employee record in this workspace.",
    ur: "منتخب کردہ اکاؤنٹ اس ورک اسپیس میں کسی ملازم کے ریکارڈ سے پہلے ہی جڑا ہوا ہے۔",
  },
  PROJECT_OS_EMPLOYEE_ALREADY_ARCHIVED: {
    ar: "بطاقة الموظف مؤرشفة بالفعل ولا يمكن إنهاء خدمتها مرة أخرى.",
    en: "This employee record is already archived and cannot be terminated again.",
    ur: "یہ ملازم کا ریکارڈ پہلے ہی محفوظ شدہ ہے اور دوبارہ ختم نہیں کیا جا سکتا۔",
  },
  PROJECT_OS_EMPLOYMENT_CONTRACT_NOT_FOUND: {
    ar: "عقد العمل المحدد غير متاح لهذه البطاقة ضمن مساحة العمل.",
    en: "The selected employment contract is unavailable for this employee in the workspace.",
    ur: "منتخب کردہ ملازمتی معاہدہ اس ورک اسپیس میں اس ملازم کے لیے دستیاب نہیں ہے۔",
  },
  PROJECT_OS_EMPLOYMENT_CONTRACT_DATES_INVALID: {
    ar: "لا يمكن أن يسبق تاريخ نهاية العقد أو نهاية التجربة تاريخ بداية العقد.",
    en: "A contract or probation end date cannot be earlier than the contract start date.",
    ur: "معاہدے یا آزمائشی مدت کی اختتامی تاریخ معاہدے کی ابتدائی تاریخ سے پہلے نہیں ہو سکتی۔",
  },
  PROJECT_OS_ROLE_ASSIGNMENT_NOT_FOUND: {
    ar: "إسناد الدور المحدد غير متاح ضمن هذه الشركة.",
    en: "The selected role assignment is not available in this organization.",
    ur: "منتخب کردہ کردار کی تفویض اس تنظیم میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_MEMBER_ALREADY_EXISTS: {
    ar: "للمستخدم المحدد عضوية قائمة ضمن هذه الشركة.",
    en: "The selected user already has a membership in this organization.",
    ur: "منتخب کردہ صارف کی اس تنظیم میں پہلے ہی رکنیت موجود ہے۔",
  },
  PROJECT_OS_INVITATION_ALREADY_PENDING: {
    ar: "توجد دعوة معلقة بالفعل لهذا البريد ضمن الشركة.",
    en: "A pending invitation already exists for this email in the organization.",
    ur: "اس ای میل کے لیے تنظیم میں پہلے ہی ایک زیرِ التوا دعوت موجود ہے۔",
  },
  PROJECT_OS_INVITATION_INVALID_OR_EXPIRED: {
    ar: "رابط الدعوة غير صالح أو انتهت صلاحيته.",
    en: "The invitation link is invalid or has expired.",
    ur: "دعوت کا لنک درست نہیں ہے یا اس کی مدت ختم ہو چکی ہے۔",
  },
  PROJECT_OS_INVITATION_EMAIL_MISMATCH: {
    ar: "يجب تسجيل الدخول بالبريد الذي استلم الدعوة.",
    en: "Sign in with the email address that received this invitation.",
    ur: "اس ای میل پتے سے لاگ ان کریں جس پر یہ دعوت آئی تھی۔",
  },
  PROJECT_OS_PORTFOLIO_NOT_FOUND: {
    ar: "المحفظة المحددة غير متاحة ضمن هذه الشركة.",
    en: "The selected portfolio is not available in this organization.",
    ur: "منتخب کردہ پورٹ فولیو اس تنظیم میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PROGRAM_NOT_FOUND: {
    ar: "البرنامج المحدد غير متاح ضمن هذه الشركة.",
    en: "The selected program is not available in this organization.",
    ur: "منتخب کردہ پروگرام اس تنظیم میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PROGRAM_PORTFOLIO_MISMATCH: {
    ar: "المحفظة المحددة لا تتطابق مع محفظة البرنامج.",
    en: "The selected portfolio does not match the program's portfolio.",
    ur: "منتخب کردہ پورٹ فولیو پروگرام کے پورٹ فولیو سے مطابقت نہیں رکھتا۔",
  },
  PROJECT_OS_LIFECYCLE_TRANSITION_INVALID: {
    ar: "انتقال دورة حياة المشروع المحدد غير مسموح من مرحلته الحالية.",
    en: "The selected project lifecycle transition is not allowed from its current stage.",
    ur: "منتخب کردہ پروجیکٹ کی لائف سائیکل تبدیلی اپنے موجودہ مرحلے سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_CONTRACT_NOT_FOUND: {
    ar: "العقد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected contract is not available in the current project and workspace.",
    ur: "منتخب کردہ معاہدہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_CONTRACT_DATES_INVALID: {
    ar: "لا يمكن أن يسبق تاريخ انتهاء العقد تاريخ بدايته.",
    en: "A contract end date cannot be earlier than its start date.",
    ur: "معاہدے کی اختتامی تاریخ اس کی ابتدائی تاریخ سے پہلے نہیں ہو سکتی۔",
  },
  PROJECT_OS_DOCUMENT_NOT_FOUND: {
    ar: "المستند المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected document is not available in the current project and workspace.",
    ur: "منتخب کردہ دستاویز موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_DOCUMENT_CONTENT_INVALID: {
    ar: "محتوى الملف غير صالح أو يتجاوز حد الحجم المسموح.",
    en: "The file content is invalid or exceeds the permitted size limit.",
    ur: "فائل کا مواد درست نہیں ہے یا مقررہ سائز کی حد سے بڑا ہے۔",
  },
  PROJECT_OS_DOCUMENT_WORKFLOW_TRANSITION_INVALID: {
    ar: "انتقال حالة المستند المحدد غير مسموح من حالته الحالية.",
    en: "The selected document-status transition is not allowed from its current status.",
    ur: "منتخب کردہ دستاویز کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_CODE_EXISTS: {
    ar: "رمز الخطة الرئيسية مستخدم بالفعل ضمن هذا المشروع.",
    en: "This Master Plan code is already in use in this project.",
    ur: "ماسٹر پلان کا یہ کوڈ اس پروجیکٹ میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_NOT_FOUND: {
    ar: "الخطة الرئيسية المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected Master Plan is not available in the current project and workspace.",
    ur: "منتخب کردہ ماسٹر پلان موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND: {
    ar: "إصدار الخطة الرئيسية المحدد غير متاح ضمن المشروع الحالي.",
    en: "The selected Master Plan version is not available in the current project.",
    ur: "منتخب کردہ ماسٹر پلان کا ورژن موجودہ پروجیکٹ میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_PARENT_NOT_FOUND: {
    ar: "الكيان المكاني الأب المحدد غير متاح ضمن إصدار الخطة الرئيسية الحالي.",
    en: "The selected parent spatial entity is not available in the current Master Plan version.",
    ur: "منتخب کردہ اوپر کی مکانی اکائی ماسٹر پلان کے موجودہ ورژن میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_PARENT_CYCLE: {
    ar: "لا يمكن أن يحتوي ملف الكيانات المكانية على دورة في علاقات الكيان الأب.",
    en: "The spatial-entity file cannot contain a cycle in parent-entity relationships.",
    ur: "مکانی اکائیوں کی فائل میں اوپر کی اکائی کے تعلق میں دائرہ نہیں ہو سکتا۔",
  },
  PROJECT_OS_MASTER_PLAN_GEOMETRY_INVALID: {
    ar: "حدود الكيان المكاني يجب أن تقع بالكامل داخل مخطط 100×100 وأن يكون له عرض وارتفاع موجبان.",
    en: "The spatial entity must fit inside the 100×100 plan and have positive width and height.",
    ur: "مکانی اکائی 100×100 کے پلان میں سمانی چاہیے، اور اس کی چوڑائی اور لمبائی مثبت ہونی چاہیے۔",
  },
  PROJECT_OS_MASTER_PLAN_PROGRESS_INVALID: {
    ar: "يجب أن تكون نسبة تقدم الكيان المكاني بين 0 و100.",
    en: "A spatial entity progress percentage must be between 0 and 100.",
    ur: "مکانی اکائی کی پیش رفت کی فیصد 0 اور 100 کے درمیان ہونی چاہیے۔",
  },
  PROJECT_OS_MASTER_PLAN_SOURCE_INVALID: {
    ar: "ملف أصل الخطة الرئيسية يجب أن يكون PNG أو JPG أو WEBP أو PDF وباسم ونوع ملف صالحين.",
    en: "The Master Plan source must be a PNG, JPG, WEBP, or PDF file with a valid file name and type.",
    ur: "ماسٹر پلان کا ماخذ درست نام اور قسم کے ساتھ PNG، JPG، WEBP یا PDF فائل ہونا چاہیے۔",
  },
  PROJECT_OS_MASTER_PLAN_MAPPING_VALIDATION_FAILED: {
    ar: "تعذر تطبيق ملف الربط لأن الأعمدة أو القيم لا تحقق قالب الخطة الرئيسية.",
    en: "The mapping file could not be applied because its columns or values do not satisfy the Master Plan template.",
    ur: "میپنگ فائل لاگو نہیں ہو سکی کیونکہ اس کے کالم یا قدریں ماسٹر پلان کے ٹیمپلیٹ پر پورا نہیں اترتیں۔",
  },
  PROJECT_OS_MASTER_PLAN_SPATIAL_IMPORT_VALIDATION_FAILED: {
    ar: "تعذر إنشاء الكيانات من الملف لأن الأعمدة أو الهندسة أو القيم لا تحقق قالب الكيانات المكانية.",
    en: "Spatial entities could not be created because the file columns, geometry, or values do not satisfy the spatial-entity template.",
    ur: "مکانی اکائیاں نہیں بن سکیں کیونکہ فائل کے کالم، جیومیٹری یا قدریں مکانی اکائی کے ٹیمپلیٹ پر پورا نہیں اترتیں۔",
  },
  PROJECT_OS_MASTER_PLAN_DRAWING_NOT_FOUND: {
    ar: "لا يوجد رسم محفوظ لنسخة الخطة الرئيسية المحددة بعد. ارفع ملف الرسم أولًا.",
    en: "No saved drawing exists for the selected Master Plan version yet. Upload the drawing file first.",
    ur: "ماسٹر پلان کے منتخب ورژن کے لیے ابھی تک کوئی محفوظ ڈرائنگ موجود نہیں۔ پہلے ڈرائنگ کی فائل اپ لوڈ کریں۔",
  },
  PROJECT_OS_MASTER_PLAN_DRAWING_LAYOUT_INVALID: {
    ar: "تخطيط الرسم غير صالح: يجب أن يكون لكل شكل مرجع فريد، وثلاث نقاط على الأقل بإحداثيات رقمية، وعنوان لا يتجاوز 120 حرفًا.",
    en: "The drawing layout is invalid: every shape needs a unique reference, at least three numeric points, and a label of at most 120 characters.",
    ur: "ڈرائنگ کا خاکہ درست نہیں: ہر شکل کا منفرد حوالہ، کم از کم تین عددی نقطے، اور 120 حروف تک کا لیبل ہونا چاہیے۔",
  },
  PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_NOT_FOUND: {
    ar: "هذا الشكل غير موجود في الرسم المحفوظ لهذه النسخة.",
    en: "This shape is not in the saved drawing of this version.",
    ur: "یہ شکل اس ورژن کی محفوظ ڈرائنگ میں موجود نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_LINKED: {
    ar: "لا يمكن حذف شكل ما زال مرتبطًا بوحدة. ألغِ الربط أولًا.",
    en: "A shape that is still linked to a unit cannot be removed. Unlink it first.",
    ur: "وہ شکل جو ابھی کسی یونٹ سے جڑی ہے، ہٹائی نہیں جا سکتی۔ پہلے اس کا جوڑ ختم کریں۔",
  },
  PROJECT_OS_MASTER_PLAN_DRAWING_FILE_INVALID: {
    ar: "الملف ليس رسمًا مقبولًا (PDF أو PNG أو JPEG أو DXF نصي)، أو لا يمكن قراءة صفحاته.",
    en: "The file is not an accepted drawing (PDF, PNG, JPEG or text DXF), or its pages cannot be read.",
    ur: "یہ فائل قابلِ قبول ڈرائنگ نہیں (PDF، PNG، JPEG یا متنی DXF)، یا اس کے صفحات نہیں پڑھے جا سکتے۔",
  },
  PROJECT_OS_MASTER_PLAN_LINK_EXISTS: {
    ar: "هذا الشكل مرتبط بوحدة بالفعل. ألغِ الربط الحالي قبل ربطه من جديد.",
    en: "This shape is already linked to a unit. Unlink it before linking it again.",
    ur: "یہ شکل پہلے ہی ایک یونٹ سے جڑی ہوئی ہے۔ دوبارہ جوڑنے سے پہلے اس کا جوڑ ختم کریں۔",
  },
  PROJECT_OS_MASTER_PLAN_UNIT_ALREADY_LINKED: {
    ar: "هذه الوحدة مرتبطة بشكل آخر في هذا الرسم. ألغِ ذلك الربط أولًا.",
    en: "This unit is already linked to another shape in this drawing. Unlink that first.",
    ur: "یہ یونٹ اس ڈرائنگ کی ایک اور شکل سے پہلے ہی جڑا ہوا ہے۔ پہلے وہ جوڑ ختم کریں۔",
  },
  PROJECT_OS_MASTER_PLAN_UNIT_NOT_FOUND: {
    ar: "الوحدة المحددة ليست وحدة في نسخة الخطة الرئيسية لهذا الرسم.",
    en: "The selected item is not a unit of this drawing's Master Plan version.",
    ur: "منتخب کردہ آئٹم اس ڈرائنگ کے ماسٹر پلان ورژن کا یونٹ نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_LINK_NOT_FOUND: {
    ar: "لا يوجد ربط مؤكَّد لهذا الشكل لإلغائه.",
    en: "This shape has no confirmed link to remove.",
    ur: "اس شکل کا کوئی تصدیق شدہ جوڑ موجود نہیں جسے ہٹایا جائے۔",
  },
  PROJECT_OS_MASTER_PLAN_ENTITY_CODE_EXISTS: {
    ar: "يوجد رمز كيان مكاني مستخدم بالفعل ضمن إصدار الخطة الرئيسية المحدد.",
    en: "A spatial-entity code in the file already exists in the selected Master Plan version.",
    ur: "فائل میں مکانی اکائی کا ایک کوڈ منتخب ماسٹر پلان ورژن میں پہلے ہی موجود ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_WBS_ACTIVITY_MISMATCH: {
    ar: "النشاط المحدد في ملف الكيان لا يتبع لعنصر WBS المحدد في الصف نفسه.",
    en: "The activity in the spatial-entity file does not belong to the WBS item selected in the same row.",
    ur: "مکانی اکائی کی فائل میں موجود سرگرمی اس قطار میں منتخب کردہ WBS آئٹم سے تعلق نہیں رکھتی۔",
  },
  PROJECT_OS_MASTER_PLAN_ENTITY_NOT_FOUND: {
    ar: "لا يتطابق أحد رموز الوحدات في الملف مع كيان مكاني ضمن إصدار الخطة الرئيسية المحدد.",
    en: "A unit code in the file does not match a spatial entity in the selected Master Plan version.",
    ur: "فائل میں یونٹ کا ایک کوڈ منتخب ماسٹر پلان ورژن کی کسی مکانی اکائی سے نہیں ملتا۔",
  },
  PROJECT_OS_LICENSING_ADMIN_REQUIRED: {
    ar: "تتطلب إدارة التراخيص صلاحية مسؤول المنصة.",
    en: "Licensing management requires platform-administrator access.",
    ur: "لائسنس کا انتظام کرنے کے لیے پلیٹ فارم ایڈمنسٹریٹر کی رسائی درکار ہے۔",
  },
  PROJECT_OS_SYNC_RUN_NOT_FOUND: {
    ar: "تعذّر إغلاق تشغيل المزامنة لأن سجله غير موجود. لم يُسجَّل لها حالة؛ أعد المحاولة.",
    en: "The sync run could not be closed because its record is missing. No status was recorded for it; try again.",
    ur: "مطابقت کا رن بند نہ ہو سکا کیونکہ اس کا ریکارڈ موجود نہیں۔ اس کی کوئی حالت درج نہیں ہوئی؛ دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_MFA_ENROLMENT_CHANGED: {
    ar: "تغيّر مفتاح التفعيل المعروض عن المخزَّن (فتحتَ الصفحة في مكان آخر؟). أعد تحميل الصفحة وامسح الرمز المعروض الآن، ثم أدخل الرمز الجديد.",
    en: "The key shown on this screen is not the one stored (did you open the page somewhere else?). Reload the page, scan the code it shows now, then enter the new code.",
    ur: "اس اسکرین پر دکھائی گئی کلید محفوظ شدہ کلید سے مختلف ہے (کیا آپ نے صفحہ کہیں اور کھولا؟)۔ صفحہ دوبارہ لوڈ کریں، اب دکھایا گیا کوڈ اسکین کریں، پھر نیا کوڈ درج کریں۔",
  },
  PROJECT_OS_MFA_POSTPONE_USED: {
    ar: "استُعمل التأجيل من قبل في هذا المتصفح وانتهت مدته. فعّل التحقق بخطوتين للمتابعة.",
    en: "The postponement was already used in this browser and has ended. Set up two-step verification to continue.",
    ur: "اس براؤزر میں مؤخر کرنے کی سہولت پہلے استعمال ہو چکی اور ختم ہو گئی۔ جاری رکھنے کے لیے دو مرحلوں کی تصدیق فعال کریں۔",
  },
  PROJECT_OS_MFA_POSTPONE_NOT_ALLOWED: {
    ar: "التأجيل لمالك المنصة وحده.",
    en: "Postponing is for the platform owner only.",
    ur: "مؤخر کرنا صرف پلیٹ فارم کے مالک کے لیے ہے۔",
  },
  PROJECT_OS_MFA_REQUIRED: {
    ar: "حسابك يتطلب التحقق بخطوتين. أدخل رمز تطبيق المصادقة (أو رمز استرداد) لمتابعة العمل.",
    en: "Your account requires two-step verification. Enter the code from your authenticator app (or a recovery code) to continue.",
    ur: "آپ کے اکاؤنٹ کو دو مرحلوں کی تصدیق درکار ہے۔ جاری رکھنے کے لیے آتھنٹیکیٹر ایپ کا کوڈ (یا ریکوری کوڈ) درج کریں۔",
  },
  PROJECT_OS_MFA_CODE_INVALID: {
    ar: "الرمز غير صحيح أو سبق استعماله. أدخل الرمز الحالي من التطبيق، أو رمز استرداد لم يُستعمل.",
    en: "That code is wrong or was already used. Enter the current code from the app, or a recovery code that has not been used.",
    ur: "کوڈ غلط ہے یا پہلے استعمال ہو چکا ہے۔ ایپ کا موجودہ کوڈ یا ایسا ریکوری کوڈ درج کریں جو استعمال نہیں ہوا۔",
  },
  PROJECT_OS_MFA_LOCKED: {
    ar: "محاولات خاطئة كثيرة. انتظر 15 دقيقة ثم حاول من جديد.",
    en: "Too many wrong attempts. Wait 15 minutes and try again.",
    ur: "بہت زیادہ غلط کوششیں۔ 15 منٹ انتظار کریں اور دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_MFA_NOT_ENROLLED: {
    ar: "لم يُفعَّل التحقق بخطوتين لحسابك بعد. ابدأ التفعيل أولًا.",
    en: "Two-step verification is not set up for your account yet. Start the setup first.",
    ur: "آپ کے اکاؤنٹ کے لیے دو مرحلوں کی تصدیق ابھی فعال نہیں۔ پہلے سیٹ اپ شروع کریں۔",
  },
  PROJECT_OS_MFA_ALREADY_ENROLLED: {
    ar: "التحقق بخطوتين مُفعَّل لحسابك. أدخل رمزك للمتابعة.",
    en: "Two-step verification is already set up for your account. Enter your code to continue.",
    ur: "آپ کے اکاؤنٹ کے لیے دو مرحلوں کی تصدیق پہلے سے فعال ہے۔ جاری رکھنے کے لیے کوڈ درج کریں۔",
  },
  PROJECT_OS_COMPANY_CREATION_OWNER_ONLY: {
    ar: "إنشاء الشركات لمالك المنصة وحده. اطلب من مالك المنصة إنشاء شركتك أو دعوتك إلى شركة قائمة.",
    en: "Only the platform owner creates companies. Ask the platform owner to create your company or to invite you to an existing one.",
    ur: "کمپنیاں صرف پلیٹ فارم کا مالک بناتا ہے۔ پلیٹ فارم کے مالک سے اپنی کمپنی بنوائیں یا کسی موجودہ کمپنی میں دعوت مانگیں۔",
  },
  PROJECT_OS_COMMERCIAL_PLAN_NOT_FOUND: {
    ar: "الخطة التجارية المحددة غير متاحة أو غير نشطة.",
    en: "The selected commercial plan is unavailable or inactive.",
    ur: "منتخب کردہ کمرشل پلان دستیاب نہیں یا غیر فعال ہے۔",
  },
  PROJECT_OS_LICENSE_NOT_FOUND: {
    ar: "الرخصة المحددة غير متاحة ضمن مساحة العمل هذه.",
    en: "The selected license is unavailable in this workspace.",
    ur: "منتخب کردہ لائسنس اس ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_LICENSE_TRANSITION_INVALID: {
    ar: "انتقال حالة الرخصة المحدد غير مسموح من حالتها الحالية.",
    en: "The selected license-status transition is not allowed from its current status.",
    ur: "منتخب کردہ لائسنس کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE: {
    ar: "لا تتضمن الرخصة النشطة الميزة المطلوبة.",
    en: "The active license does not include the required feature.",
    ur: "فعال لائسنس میں درکار خصوصیت شامل نہیں ہے۔",
  },
  PROJECT_OS_LICENSE_LIMIT_EXCEEDED: {
    ar: "تم بلوغ الحد المسموح لهذه الميزة في الرخصة النشطة.",
    en: "The active license limit for this feature has been reached.",
    ur: "اس خصوصیت کے لیے فعال لائسنس کی حد پوری ہو چکی ہے۔",
  },
  PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED: {
    ar: "تم بلوغ عدد المقاعد المسموح به في الرخصة النشطة.",
    en: "The active license seat limit has been reached.",
    ur: "فعال لائسنس کی نشستوں کی حد پوری ہو چکی ہے۔",
  },
  PROJECT_OS_SIGNUP_EMAIL_REQUIRED: {
    ar: "يتطلب إنشاء مساحة عمل ذاتية بريدًا موثقًا في جلسة الحساب الحالية.",
    en: "Self-service workspace creation requires an email address on the current authenticated account.",
    ur: "خود سے ورک اسپیس بنانے کے لیے موجودہ تصدیق شدہ اکاؤنٹ پر ای میل پتا ہونا ضروری ہے۔",
  },
  PROJECT_OS_SIGNUP_RATE_LIMITED: {
    ar: "تم بلوغ الحد المؤقت لمحاولات إنشاء مساحات العمل. حاول لاحقًا.",
    en: "The temporary workspace-creation limit has been reached. Try again later.",
    ur: "ورک اسپیس بنانے کی عارضی حد پوری ہو چکی ہے۔ بعد میں دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_WORKSPACE_SLUG_EXISTS: {
    ar: "الاسم المختصر لمساحة العمل مستخدم بالفعل. اختر اسمًا مختصرًا آخر.",
    en: "This workspace slug is already in use. Choose a different workspace slug.",
    ur: "یہ مختصر نام پہلے سے استعمال ہو رہا ہے۔ کوئی اور مختصر نام منتخب کریں۔",
  },
  PROJECT_OS_WORKSPACE_SLUG_REQUIRED: {
    ar: "أدخل الاسم المختصر لمساحة العمل.",
    en: "Enter the workspace short name.",
    ur: "ورک اسپیس کا مختصر نام درج کریں۔",
  },
  PROJECT_OS_WORKSPACE_SLUG_TOO_SHORT: {
    ar: "الاسم المختصر يجب أن يكون ٣ أحرف على الأقل.",
    en: "The short name must be at least 3 characters.",
    ur: "مختصر نام کم از کم 3 حروف کا ہونا چاہیے۔",
  },
  PROJECT_OS_WORKSPACE_SLUG_TOO_LONG: {
    ar: "الاسم المختصر طويل جدًا، وحده الأقصى ١٢٠ حرفًا.",
    en: "The short name is too long. It can be 120 characters at most.",
    ur: "مختصر نام بہت لمبا ہے۔ زیادہ سے زیادہ 120 حروف ہو سکتے ہیں۔",
  },
  PROJECT_OS_WORKSPACE_SLUG_FORMAT: {
    ar: "استعمل أحرفًا إنجليزية صغيرة وأرقامًا وشرطة فقط، مثل: fanaa.",
    en: "Use only lowercase English letters, digits and dashes, for example: fanaa.",
    ur: "صرف چھوٹے انگریزی حروف، ہندسے اور ڈیش استعمال کریں، مثلاً: fanaa۔",
  },
  PROJECT_OS_FIELD_REQUIRED: {
    ar: "هذا الحقل مطلوب.",
    en: "This field is required.",
    ur: "یہ فیلڈ ضروری ہے۔",
  },
  PROJECT_OS_FIELD_NUMBER_INVALID: {
    ar: "أدخل رقمًا صحيحًا.",
    en: "Enter a valid number.",
    ur: "درست عدد درج کریں۔",
  },
  PROJECT_OS_FIELD_TOO_SHORT: {
    ar: "النص أقصر من الحد الأدنى المطلوب.",
    en: "The value is shorter than the minimum.",
    ur: "قدر کم از کم حد سے چھوٹی ہے۔",
  },
  PROJECT_OS_FIELD_OUT_OF_RANGE: {
    ar: "القيمة خارج الحدود المسموحة.",
    en: "The value is outside the allowed range.",
    ur: "قدر اجازت شدہ حد سے باہر ہے۔",
  },
  PROJECT_OS_FIELD_DATE_INVALID: {
    ar: "أدخل تاريخًا صحيحًا.",
    en: "Enter a valid date.",
    ur: "درست تاریخ درج کریں۔",
  },
  PROJECT_OS_FIELD_EMAIL_INVALID: {
    ar: "أدخل عنوان بريد إلكتروني صحيحًا.",
    en: "Enter a valid email address.",
    ur: "درست ای میل پتہ درج کریں۔",
  },
  PROJECT_OS_INPUT_INVALID: {
    ar: "تحقق من الحقل المحدد ثم أعد المحاولة.",
    en: "Check the field that is marked and try again.",
    ur: "نشان زدہ فیلڈ چیک کریں اور دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE: {
    ar: "تعذر إنشاء مساحة العمل الآن. لم تُنشأ أي بيانات. أعد المحاولة لاحقًا أو تواصل مع الدعم إذا استمر الخطأ.",
    en: "The workspace could not be created now. No data was created. Try again later or contact support if the error persists.",
    ur: "ابھی ورک اسپیس نہیں بن سکا۔ کوئی ڈیٹا نہیں بنایا گیا۔ بعد میں دوبارہ کوشش کریں، یا خرابی برقرار رہے تو سپورٹ سے رابطہ کریں۔",
  },
  PROJECT_OS_BILLING_SUBSCRIPTION_NOT_FOUND: {
    ar: "الاشتراك المحدد غير متاح ضمن مساحة العمل الحالية.",
    en: "The selected subscription is unavailable in the current workspace.",
    ur: "منتخب کردہ سبسکرپشن موجودہ ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PAYMENT_CONFIRMATION_INVALID: {
    ar: "لا يمكن تأكيد سجل الدفع اليدوي المحدد في حالته الحالية.",
    en: "The selected manual payment record cannot be confirmed in its current state.",
    ur: "منتخب کردہ دستی ادائیگی کا ریکارڈ اپنی موجودہ حیثیت میں تصدیق نہیں ہو سکتا۔",
  },
  PROJECT_OS_SUPPORT_TICKET_NOT_FOUND: {
    ar: "تذكرة الدعم المحددة غير متاحة ضمن مساحة العمل الحالية.",
    en: "The selected support ticket is unavailable in the current workspace.",
    ur: "منتخب کردہ سپورٹ ٹکٹ موجودہ ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_SUPPORT_SOURCE_DOCUMENT_NOT_ALLOWED: {
    ar: "لا يمكن استخدام هذا المستند كمصدر للمعرفة؛ يجب أن يكون مستندًا معتمدًا ضمن مساحة العمل.",
    en: "This document cannot be used as a knowledge source; it must be an approved document in the workspace.",
    ur: "یہ دستاویز بطور علمی ماخذ استعمال نہیں ہو سکتی؛ یہ ورک اسپیس کی منظور شدہ دستاویز ہونی چاہیے۔",
  },
  PROJECT_OS_RFI_NOT_FOUND: {
    ar: "طلب المعلومات المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected RFI is not available in the current project and workspace.",
    ur: "منتخب کردہ RFI موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_RFI_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب المعلومات المحدد غير مسموح من حالته الحالية.",
    en: "The selected RFI-status transition is not allowed from its current status.",
    ur: "منتخب کردہ RFI کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_NCR_NOT_FOUND: {
    ar: "سجل عدم المطابقة المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected NCR is not available in the current project and workspace.",
    ur: "منتخب کردہ NCR موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_NCR_TRANSITION_INVALID: {
    ar: "انتقال حالة عدم المطابقة المحدد غير مسموح من حالته الحالية.",
    en: "The selected NCR-status transition is not allowed from its current status.",
    ur: "منتخب کردہ NCR کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_HSE_OBSERVATION_NOT_FOUND: {
    ar: "ملاحظة HSE المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected HSE observation is not available in the current project and workspace.",
    ur: "منتخب کردہ HSE مشاہدہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_HSE_TRANSITION_INVALID: {
    ar: "انتقال حالة ملاحظة HSE المحدد غير مسموح من حالتها الحالية.",
    en: "The selected HSE-observation transition is not allowed from its current status.",
    ur: "منتخب کردہ HSE مشاہدے کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_FIELD_REPORT_NOT_FOUND: {
    ar: "التقرير الميداني المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected field report is not available in the current project and workspace.",
    ur: "منتخب کردہ فیلڈ رپورٹ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_FIELD_REPORT_TRANSITION_INVALID: {
    ar: "انتقال حالة التقرير الميداني المحدد غير مسموح من حالته الحالية.",
    en: "The selected field-report transition is not allowed from its current status.",
    ur: "منتخب کردہ فیلڈ رپورٹ کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_FIELD_REPORT_WORKFORCE_INVALID: {
    ar: "عدد العاملين في التقرير الميداني يجب أن يكون عددًا صحيحًا بين صفر و100000.",
    en: "The field-report workforce count must be a whole number between 0 and 100000.",
    ur: "فیلڈ رپورٹ میں افرادی قوت کی تعداد 0 اور 100000 کے درمیان کا پورا عدد ہونی چاہیے۔",
  },
  PROJECT_OS_QUALITY_INSPECTION_NOT_FOUND: {
    ar: "فحص الجودة المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected quality inspection is not available in the current project and workspace.",
    ur: "منتخب کردہ معیار کا معائنہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_QUALITY_INSPECTION_TRANSITION_INVALID: {
    ar: "انتقال حالة فحص الجودة المحدد غير مسموح من حالته الحالية.",
    en: "The selected quality-inspection transition is not allowed from its current status.",
    ur: "منتخب کردہ معیار کے معائنے کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_PURCHASE_ORDER_NOT_FOUND: {
    ar: "أمر الشراء المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected purchase order is not available in the current project and workspace.",
    ur: "منتخب کردہ خریداری کا آرڈر موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PURCHASE_ORDER_TRANSITION_INVALID: {
    ar: "انتقال حالة أمر الشراء المحدد غير مسموح من حالته الحالية.",
    en: "The selected purchase-order transition is not allowed from its current status.",
    ur: "منتخب کردہ خریداری کے آرڈر کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_PURCHASE_ORDER_REFERENCE_INVALID: {
    ar: "العقد أو الالتزام المحدد لا يطابق الشركة والمشروع الحاليين.",
    en: "The selected contract or commitment does not belong to the current tenant and project.",
    ur: "منتخب کردہ معاہدہ یا وعدہ موجودہ کمپنی اور پروجیکٹ سے تعلق نہیں رکھتا۔",
  },
  PROJECT_OS_CONTROL_LINK_REFERENCE_INVALID: {
    ar: "سجل المصدر أو الهدف المحدد لا يطابق الشركة والمشروع الحاليين.",
    en: "The selected source or target record does not belong to the current tenant and project.",
    ur: "منتخب کردہ ماخذ یا ہدف کا ریکارڈ موجودہ کمپنی اور پروجیکٹ سے تعلق نہیں رکھتا۔",
  },
  PROJECT_OS_CONTROL_LINK_SELF_REFERENCE: {
    ar: "لا يمكن ربط السجل بنفسه.",
    en: "A record cannot be linked to itself.",
    ur: "کوئی ریکارڈ خود اپنے ساتھ نہیں جوڑا جا سکتا۔",
  },
  PROJECT_OS_CONTROL_LINK_DUPLICATE: {
    ar: "الرابط المحدد موجود بالفعل ضمن المشروع.",
    en: "The selected record link already exists in this project.",
    ur: "منتخب کردہ ریکارڈ کا جوڑ اس پروجیکٹ میں پہلے ہی موجود ہے۔",
  },
  PROJECT_OS_CHANGE_REQUEST_NOT_FOUND: {
    ar: "طلب التغيير المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected change request is not available in the current project and workspace.",
    ur: "منتخب کردہ تبدیلی کی درخواست موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_CHANGE_REQUEST_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب التغيير المحدد غير مسموح من حالته الحالية.",
    en: "The selected change-request transition is not allowed from its current status.",
    ur: "منتخب کردہ تبدیلی کی درخواست کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_ISSUE_NOT_FOUND: {
    ar: "القضية المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected issue is not available in the current project and workspace.",
    ur: "منتخب کردہ مسئلہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_ACTION_NOT_FOUND: {
    ar: "الإجراء المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected action is not available in the current project and workspace.",
    ur: "منتخب کردہ اقدام موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_ESCALATION_TRANSITION_INVALID: {
    ar: "انتقال حالة التصعيد المحدد غير مسموح من حالته الحالية.",
    en: "The selected escalation transition is not allowed from its current status.",
    ur: "منتخب کردہ اضافہ (اسکیلیشن) کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_ESCALATION_NOT_ELIGIBLE: {
    ar: "لا يستوفي هذا السجل شروط التصعيد في حالته الحالية.",
    en: "This record does not meet the escalation conditions in its current state.",
    ur: "یہ ریکارڈ اپنی موجودہ حالت میں اضافے کی شرائط پوری نہیں کرتا۔",
  },
  PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN: {
    ar: "لا يمكن أن تتجاوز وحدات المورد المخصصة وحداته المخططة.",
    en: "Allocated resource units cannot exceed planned resource units.",
    ur: "مختص وسائل کی اکائیاں منصوبہ بند وسائل کی اکائیوں سے زیادہ نہیں ہو سکتیں۔",
  },
  PROJECT_OS_RESOURCE_NOT_FOUND: {
    ar: "المورد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected resource is not available in the current project and workspace.",
    ur: "منتخب کردہ وسیلہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_ASSIGNMENT_NOT_FOUND: {
    ar: "الإسناد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected assignment is not available in the current project and workspace.",
    ur: "منتخب کردہ تفویض موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED: {
    ar: "يلزم اعتماد حضور الموظف بحالة حاضر في هذا اليوم قبل تسجيل ساعات العمل.",
    en: "Approved present attendance for this day is required before work hours can be recorded.",
    ur: "کام کے گھنٹے درج کرنے سے پہلے اس دن کی منظور شدہ حاضری درکار ہے۔",
  },
  PROJECT_OS_ATTENDANCE_DAY_EXISTS: {
    ar: "يوجد سجل حضور لهذا الموظف في التاريخ المحدد بالفعل.",
    en: "An attendance record already exists for this employee on the selected date.",
    ur: "منتخب تاریخ پر اس ملازم کا حاضری کا ریکارڈ پہلے ہی موجود ہے۔",
  },
  PROJECT_OS_ATTENDANCE_TRANSITION_INVALID: {
    ar: "انتقال حالة الحضور المطلوب غير مسموح من حالته الحالية.",
    en: "The requested attendance transition is not allowed from its current status.",
    ur: "درخواست کردہ حاضری کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_TIME_ENTRY_DAY_EXISTS: {
    ar: "يوجد سجل ساعات لهذا الإسناد في التاريخ المحدد بالفعل.",
    en: "A work-hours entry already exists for this assignment on the selected date.",
    ur: "منتخب تاریخ پر اس تفویض کے لیے کام کے گھنٹوں کا اندراج پہلے ہی موجود ہے۔",
  },
  PROJECT_OS_TIME_ENTRY_TRANSITION_INVALID: {
    ar: "انتقال حالة ساعات العمل المطلوب غير مسموح من حالته الحالية.",
    en: "The requested work-hours transition is not allowed from its current status.",
    ur: "درخواست کردہ کام کے گھنٹوں کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED: {
    ar: "يلزم ربط حسابك ببطاقة موظف نشطة لعرض مؤشراتك الفردية.",
    en: "Your account must be linked to an active employee record to view individual indicators.",
    ur: "انفرادی اشاریے دیکھنے کے لیے آپ کا اکاؤنٹ کسی فعال ملازم کے ریکارڈ سے جڑا ہونا چاہیے۔",
  },
  PROJECT_OS_PERFORMANCE_SELF_ONLY: {
    ar: "لا يمكن عرض مؤشرات موظف آخر هنا. تُعرض مؤشراتك الفردية فقط.",
    en: "Another employee's indicators cannot be viewed here. Only your own individual indicators are shown.",
    ur: "یہاں کسی دوسرے ملازم کے اشاریے نہیں دیکھے جا سکتے۔ صرف آپ کے اپنے انفرادی اشاریے دکھائے جاتے ہیں۔",
  },
  PROJECT_OS_PERFORMANCE_EXCLUSION_REASON_REQUIRED: {
    ar: "أدخل سببًا موثقًا وواضحًا لاستبعاد هذا السجل من المؤشر.",
    en: "Enter a clear documented reason before excluding this record from the indicator.",
    ur: "اس ریکارڈ کو اشاریے سے خارج کرنے سے پہلے واضح اور دستاویزی وجہ لکھیں۔",
  },
  PROJECT_OS_PERFORMANCE_SOURCE_NOT_FOUND: {
    ar: "السجل المطلوب استبعاده غير متاح ضمن مؤشر هذا الموظف والمشروع.",
    en: "The record selected for exclusion is not available in this employee's project indicator.",
    ur: "خارج کرنے کے لیے منتخب کردہ ریکارڈ اس ملازم کے پروجیکٹ اشاریے میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PERFORMANCE_SOURCE_ALREADY_EXCLUDED: {
    ar: "هذا السجل مستبعد بالفعل بسبب موثق.",
    en: "This record already has a documented exclusion.",
    ur: "اس ریکارڈ کا دستاویزی اخراج پہلے ہی ہو چکا ہے۔",
  },
  PROJECT_OS_PERFORMANCE_OBJECTION_STATEMENT_INVALID: {
    ar: "اكتب اعتراضًا واضحًا لا يقل عن 20 حرفًا قبل الإرسال.",
    en: "Write a clear objection of at least 20 characters before submitting it.",
    ur: "جمع کرنے سے پہلے کم از کم 20 حروف پر مشتمل واضح اعتراض لکھیں۔",
  },
  PROJECT_OS_PERFORMANCE_SELF_SERVICE_REQUIRED: {
    ar: "لا يمكن تقديم الاعتراض إلا من الموظف صاحب المؤشر.",
    en: "Only the employee who owns this indicator can submit an objection.",
    ur: "اعتراض صرف وہ ملازم جمع کر سکتا ہے جس کا یہ اشاریہ ہے۔",
  },
  PROJECT_OS_PERFORMANCE_OBJECTION_NOT_FOUND: {
    ar: "الاعتراض المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected objection is not available in the current project and workspace.",
    ur: "منتخب کردہ اعتراض موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_PERFORMANCE_OBJECTION_TRANSITION_INVALID: {
    ar: "انتقال حالة الاعتراض المطلوب غير مسموح من حالته الحالية.",
    en: "The requested objection transition is not allowed from its current status.",
    ur: "درخواست کردہ اعتراض کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_PERFORMANCE_RESOLUTION_REQUIRED: {
    ar: "أدخل ملاحظة معالجة واضحة قبل إغلاق الاعتراض أو رفضه.",
    en: "Enter a clear resolution note before resolving or rejecting an objection.",
    ur: "اعتراض حل کرنے یا مسترد کرنے سے پہلے واضح فیصلے کا نوٹ لکھیں۔",
  },
  PROJECT_OS_MATERIAL_CODE_EXISTS: {
    ar: "رمز المادة مستخدم بالفعل ضمن مساحة العمل هذه.",
    en: "This material code is already in use in this workspace.",
    ur: "یہ مادّے کا کوڈ اس ورک اسپیس میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_MATERIAL_NOT_FOUND: {
    ar: "المادة المحددة غير متاحة ضمن مساحة العمل هذه.",
    en: "The selected material is not available in this workspace.",
    ur: "منتخب کردہ مادّہ اس ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_WAREHOUSE_CODE_EXISTS: {
    ar: "رمز المستودع مستخدم بالفعل ضمن هذا المشروع.",
    en: "This warehouse code is already in use in this project.",
    ur: "یہ گودام کا کوڈ اس پروجیکٹ میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_WAREHOUSE_NOT_FOUND: {
    ar: "المستودع المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected warehouse is not available in the current project and workspace.",
    ur: "منتخب کردہ گودام موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_WAREHOUSE_INACTIVE: {
    ar: "لا يمكن تسجيل حركة على مستودع غير نشط.",
    en: "An inventory movement cannot be recorded for an inactive warehouse.",
    ur: "غیر فعال گودام میں اسٹاک کی نقل و حرکت درج نہیں کی جا سکتی۔",
  },
  PROJECT_OS_INVENTORY_DELTA_INVALID: {
    ar: "كمية حركة المخزون لا تتوافق مع نوع الاستلام أو الصرف أو التعديل.",
    en: "The inventory quantity does not match the selected receipt, issue, or adjustment type.",
    ur: "اسٹاک کی مقدار منتخب وصولی، اجرا یا ایڈجسٹمنٹ کی قسم سے مطابقت نہیں رکھتی۔",
  },
  PROJECT_OS_INVENTORY_TRANSFER_SAME_PROJECT: {
    ar: "المشروع المصدر والمشروع الوجهة واحد؛ استعمل التحويل بين مستودعات المشروع.",
    en: "The source and destination project are the same; use the transfer between the project's own warehouses.",
    ur: "ماخذ اور منزل کا پروجیکٹ ایک ہی ہے؛ پروجیکٹ کے اپنے گوداموں کے درمیان منتقلی استعمال کریں۔",
  },
  PROJECT_OS_MATERIAL_ISSUE_NOT_FOUND: {
    ar: "عملية الصرف المطلوب الإرجاع منها غير موجودة في هذا المشروع.",
    en: "The issue being returned from does not exist in this project.",
    ur: "جس اجرا سے واپسی ہو رہی ہے وہ اس پروجیکٹ میں موجود نہیں ہے۔",
  },
  PROJECT_OS_MATERIAL_RETURN_EXCEEDS_ISSUE: {
    ar: "الكمية المرجعة أكبر مما بقي من الصرف الأصلي.",
    en: "The returned quantity is more than what remains of the original issue.",
    ur: "واپس کی گئی مقدار اصل اجرا میں باقی رہنے والی مقدار سے زیادہ ہے۔",
  },
  PROJECT_OS_MATERIAL_RETURN_QUANTITY_INVALID: {
    ar: "أدخل كمية إرجاع موجبة.",
    en: "Enter a positive quantity to return.",
    ur: "واپس کرنے کے لیے مثبت مقدار درج کریں۔",
  },
  PROJECT_OS_PMC_ACTIVITY_MODEL_MISMATCH: {
    ar: "هذا النشاط يتبع نموذجًا غير نموذج الوحدة المختارة.",
    en: "This activity belongs to a different model than the chosen unit.",
    ur: "یہ سرگرمی منتخب یونٹ سے مختلف ماڈل کی ہے۔",
  },
  PROJECT_OS_PMC_ACTIVITY_NOT_LINKED_TO_WBS: {
    ar: "هذا النشاط غير مربوط ببند WBS، فلا يمكن تحميل تكلفة عليه. اربطه أولًا.",
    en: "This activity is not linked to a WBS item, so no cost can be charged to it. Link it first.",
    ur: "یہ سرگرمی کسی WBS آئٹم سے نہیں جڑی، اس لیے اس پر لاگت درج نہیں ہو سکتی۔ پہلے اسے جوڑیں۔",
  },
  PROJECT_OS_STOCKTAKE_DUPLICATE_MATERIAL: {
    ar: "مادة مذكورة أكثر من مرة في الجرد؛ لكل مادة سطر واحد.",
    en: "A material appears more than once in the count; give each material one line.",
    ur: "ایک مادّہ گنتی میں ایک سے زیادہ بار آیا ہے؛ ہر مادّے کو ایک ہی قطار دیں۔",
  },
  PROJECT_OS_STOCKTAKE_EMPTY: {
    ar: "الجرد بلا أسطر؛ أضف مادة واحدة على الأقل.",
    en: "The count has no lines; add at least one material.",
    ur: "گنتی میں کوئی قطار نہیں ہے؛ کم از کم ایک مادّہ شامل کریں۔",
  },
  PROJECT_OS_STOCKTAKE_QUANTITY_INVALID: {
    ar: "الكمية المعدودة يجب أن تكون صفرًا أو أكثر.",
    en: "A counted quantity must be zero or more.",
    ur: "گنی گئی مقدار صفر یا اس سے زیادہ ہونی چاہیے۔",
  },
  PROJECT_OS_MATERIAL_NOT_APPROVED: {
    ar: "هذه المادة لم يعتمد الاستشاري تسليمها، وسياسة الشركة تمنع صرفها.",
    en: "This material's approval submittal has not been approved, and the company's policy blocks issuing it.",
    ur: "اس مادّے کی منظوری کی جمع شدہ دستاویز ابھی منظور نہیں ہوئی، اور کمپنی کی پالیسی اس کے اجرا کو روکتی ہے۔",
  },
  PROJECT_OS_POLICY_CODES_INVALID: {
    ar: "رموز القبول غير صالحة؛ استعمل رموزًا من حرف إلى أربعة (أحرف وأرقام).",
    en: "The acceptance codes are not valid; use codes of one to four letters or digits.",
    ur: "قبولیت کے کوڈ درست نہیں ہیں؛ ایک سے چار حروف یا ہندسوں کے کوڈ استعمال کریں۔",
  },
  PROJECT_OS_QC_NOT_ACCEPTED: {
    ar: "لا يُحتسب النشاط مكتملًا قبل قبول فحص الجودة لهذه الوحدة وهذا النشاط، وسياسة الشركة تمنع ذلك.",
    en: "An activity cannot be complete before quality has accepted an inspection of this unit and activity, and the company's policy blocks it.",
    ur: "کسی سرگرمی کو مکمل کرنے سے پہلے اس یونٹ اور سرگرمی کے معائنے کو معیار کی ٹیم نے قبول کرنا ضروری ہے، اور کمپنی کی پالیسی اس کو روکتی ہے۔",
  },
  PROJECT_OS_SITE_REPORT_DATE_FUTURE: {
    ar: "لا يُكتب تقرير يومي بتاريخ مستقبلي.",
    en: "A daily report cannot be dated in the future.",
    ur: "روزانہ رپورٹ کی تاریخ مستقبل کی نہیں ہو سکتی۔",
  },
  PROJECT_OS_SITE_REPORT_DATE_INVALID: {
    ar: "تاريخ التقرير غير صالح.",
    en: "The report date is not valid.",
    ur: "رپورٹ کی تاریخ درست نہیں ہے۔",
  },
  PROJECT_OS_SITE_REPORT_EMPTY: {
    ar: "التقرير فارغ؛ أضف بندًا أو ملخصًا قبل الإرسال.",
    en: "The report is empty; add a line or a summary before sending.",
    ur: "رپورٹ خالی ہے؛ بھیجنے سے پہلے ایک قطار یا خلاصہ شامل کریں۔",
  },
  PROJECT_OS_SITE_REPORT_LINE_INVALID: {
    ar: "بند التقرير ناقص: العمالة والمعدات تحتاج اسمًا وعددًا موجبًا، وبند العمل يحتاج وصفًا أو حالة.",
    en: "A report line is incomplete: labour and equipment need a name and a positive number, and a work line needs a description or a status.",
    ur: "رپورٹ کی ایک قطار نامکمل ہے: افرادی قوت اور آلات کے لیے نام اور مثبت عدد درکار ہے، اور کام کی قطار کے لیے تفصیل یا حیثیت ضروری ہے۔",
  },
  PROJECT_OS_SITE_REPORT_LOCKED: {
    ar: "التقرير أُرسل أو اعتُمد ولا يُعدَّل.",
    en: "The report has been sent or approved and cannot be changed.",
    ur: "یہ رپورٹ بھیجی یا منظور کی جا چکی ہے، اس لیے اس میں تبدیلی نہیں ہو سکتی۔",
  },
  PROJECT_OS_SITE_REPORT_NOT_FOUND: {
    ar: "التقرير اليومي غير موجود في هذا المشروع.",
    en: "The daily report does not exist in this project.",
    ur: "یہ روزانہ رپورٹ اس پروجیکٹ میں موجود نہیں ہے۔",
  },
  PROJECT_OS_SITE_REPORT_NOT_SUBMITTED: {
    ar: "التقرير ليس بانتظار المراجعة.",
    en: "The report is not waiting for review.",
    ur: "یہ رپورٹ جائزے کے انتظار میں نہیں ہے۔",
  },
  PROJECT_OS_SITE_REPORT_NOT_YOURS: {
    ar: "هذا التقرير يخص مهندسًا آخر.",
    en: "This report belongs to another engineer.",
    ur: "یہ رپورٹ کسی دوسرے انجینئر کی ہے۔",
  },
  PROJECT_OS_SITE_REPORT_PHOTO_INVALID: {
    ar: "الملف ليس صورة (PNG أو JPEG أو WebP).",
    en: "The file is not an image (PNG, JPEG or WebP).",
    ur: "یہ فائل تصویر نہیں ہے (PNG، JPEG یا WebP درکار ہیں)۔",
  },
  PROJECT_OS_SITE_REPORT_PHOTO_TOO_LARGE: {
    ar: "الصورة أكبر من 10 MB.",
    en: "The photo is larger than 10 MB.",
    ur: "تصویر 10 MB سے بڑی ہے۔",
  },
  PROJECT_OS_SITE_REPORT_REJECT_REASON_REQUIRED: {
    ar: "اكتب سبب الإرجاع ليعرف المهندس ما يصحّحه.",
    en: "Write the reason so the engineer knows what to fix.",
    ur: "وجہ لکھیں تاکہ انجینئر جان سکے کہ کیا درست کرنا ہے۔",
  },
  PROJECT_OS_SITE_REPORT_SELF_REVIEW: {
    ar: "لا تعتمد تقريرًا كتبته أنت؛ يعتمده مدير آخر.",
    en: "You cannot approve a report you wrote; another manager approves it.",
    ur: "آپ وہ رپورٹ منظور نہیں کر سکتے جو آپ نے خود لکھی ہے؛ اسے کوئی دوسرا مینیجر منظور کرے گا۔",
  },
  PROJECT_OS_SITE_REPORT_STATUS_NEEDS_CELL: {
    ar: "الحالة المبلَّغ عنها تحتاج وحدة ونشاطًا معًا.",
    en: "A reported status needs both a unit and an activity.",
    ur: "رپورٹ کی حیثیت کے لیے یونٹ اور سرگرمی دونوں درکار ہیں۔",
  },
  PROJECT_OS_SITE_REPORT_TOO_MANY_PHOTOS: {
    ar: "بلغ التقرير الحد الأقصى من الصور (30).",
    en: "The report has reached its photo limit (30).",
    ur: "رپورٹ اپنی تصاویر کی حد (30) تک پہنچ چکی ہے۔",
  },
  PROJECT_OS_SUBMITTAL_CODES_INVALID: {
    ar: "رموز الرد مكررة أو غير صالحة.",
    en: "The reply codes are duplicated or not valid.",
    ur: "جواب کے کوڈ دہرائے گئے ہیں یا درست نہیں ہیں۔",
  },
  PROJECT_OS_SUBMITTAL_CODES_NEED_BOTH: {
    ar: "يلزم رمز معتمِد فعّال ورمز غير معتمِد فعّال على الأقل.",
    en: "At least one active approving code and one active non-approving code are required.",
    ur: "کم از کم ایک فعال منظوری کا کوڈ اور ایک فعال غیر منظوری کا کوڈ درکار ہے۔",
  },
  PROJECT_OS_SUBMITTAL_DATE_FUTURE: {
    ar: "تاريخ الإرسال في المستقبل.",
    en: "The send date is in the future.",
    ur: "بھیجنے کی تاریخ مستقبل کی ہے۔",
  },
  PROJECT_OS_SUBMITTAL_MATERIAL_REQUIRED: {
    ar: "اعتماد المواد يحتاج تحديد المادة.",
    en: "A material approval needs the material.",
    ur: "مادّے کی منظوری کے لیے مادّہ درکار ہے۔",
  },
  PROJECT_OS_SUBMITTAL_NOT_FOUND: {
    ar: "التسليم غير موجود في هذا المشروع.",
    en: "The submittal does not exist in this project.",
    ur: "یہ جمع شدہ دستاویز اس پروجیکٹ میں موجود نہیں ہے۔",
  },
  PROJECT_OS_SUBMITTAL_NUMBER_EXISTS: {
    ar: "رقم التسليم مستعمل في هذا المشروع؛ لإعادة التقديم استعمل «إعادة تقديم».",
    en: "The submittal number is already used in this project; to resubmit, use the resubmit action.",
    ur: "جمع شدہ دستاویز کا یہ نمبر اس پروجیکٹ میں پہلے ہی استعمال ہو چکا ہے؛ دوبارہ جمع کرنے کے لیے دوبارہ جمع کرنے کا اقدام استعمال کریں۔",
  },
  PROJECT_OS_SUBMITTAL_REPLY_BEFORE_SENT: {
    ar: "تاريخ الرد قبل تاريخ الإرسال.",
    en: "The reply date is before the send date.",
    ur: "جواب کی تاریخ بھیجنے کی تاریخ سے پہلے ہے۔",
  },
  PROJECT_OS_SUBMITTAL_REPLY_CODE_UNKNOWN: {
    ar: "رمز الرد غير معرَّف أو متوقف عند الشركة.",
    en: "The reply code is not one of the company's active codes.",
    ur: "جواب کا کوڈ کمپنی کے فعال کوڈوں میں شامل نہیں ہے۔",
  },
  PROJECT_OS_SUBMITTAL_RESUBMISSION_INVALID: {
    ar: "لا يُعاد تقديم إلا تسليم ردّ عليه الاستشاري برمز غير معتمِد.",
    en: "Only a submittal answered with a non-approving code can be resubmitted.",
    ur: "صرف وہ جمع شدہ دستاویز دوبارہ جمع ہو سکتی ہے جس کا جواب غیر منظوری کے کوڈ سے آیا ہو۔",
  },
  PROJECT_OS_SUBMITTAL_SELF_REPLY: {
    ar: "من أرسل التسليم لا يسجّل ردّه.",
    en: "Whoever sent the submittal does not record its reply.",
    ur: "جس نے جمع شدہ دستاویز بھیجی ہو وہ اس کا جواب درج نہیں کرتا۔",
  },
  PROJECT_OS_SUBMITTAL_TRANSITION_INVALID: {
    ar: "هذا الإجراء غير متاح لحالة التسليم الحالية.",
    en: "That step is not available in the submittal's current state.",
    ur: "یہ قدم جمع شدہ دستاویز کی موجودہ حالت میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_API_EXPORT_UNKNOWN: {
    ar: "نوع التصدير غير معروف.",
    en: "The export type is unknown.",
    ur: "ایکسپورٹ کی قسم معلوم نہیں ہے۔",
  },
  PROJECT_OS_API_KEY_INVALID: {
    ar: "مفتاح الـAPI غير صالح أو ملغى أو منتهٍ.",
    en: "The API key is invalid, revoked or expired.",
    ur: "API کلید درست نہیں، منسوخ شدہ ہے یا اس کی مدت ختم ہو چکی ہے۔",
  },
  PROJECT_OS_API_KEY_NOT_FOUND: {
    ar: "المفتاح غير موجود أو أُلغي مسبقًا.",
    en: "The key does not exist or was already revoked.",
    ur: "یہ کلید موجود نہیں ہے یا پہلے ہی منسوخ ہو چکی ہے۔",
  },
  PROJECT_OS_API_MAPPING_TYPE_UNKNOWN: {
    ar: "نوع الربط غير معروف.",
    en: "The mapping type is unknown.",
    ur: "میپنگ کی قسم معلوم نہیں ہے۔",
  },
  PROJECT_OS_API_PROJECT_UNKNOWN: {
    ar: "المشروع المطلوب غير موجود في شركة هذا المفتاح.",
    en: "The requested project does not exist in this key's company.",
    ur: "درخواست کردہ پروجیکٹ اس کلید کی کمپنی میں موجود نہیں ہے۔",
  },
  PROJECT_OS_API_RATE_LIMITED: {
    ar: "تجاوز المفتاح حد الطلبات في الدقيقة؛ أعد المحاولة بعد المدة المذكورة.",
    en: "The key exceeded its calls per minute; retry after the stated time.",
    ur: "کلید نے فی منٹ کی اجازت سے زیادہ کالیں کی ہیں؛ بتائے گئے وقت کے بعد دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_API_SCOPES_INVALID: {
    ar: "صلاحيات المفتاح غير صالحة.",
    en: "The key's powers are not valid.",
    ur: "کلید کے اختیارات درست نہیں ہیں۔",
  },
  PROJECT_OS_API_SCOPE_MISSING: {
    ar: "هذا المفتاح لا يملك الصلاحية اللازمة لهذا الطلب.",
    en: "This key lacks the power this call needs.",
    ur: "اس کلید کے پاس یہ کال کرنے کا اختیار نہیں ہے۔",
  },
  PROJECT_OS_API_VALIDATION: {
    ar: "الطلب لا يطابق الشكل الموثّق.",
    en: "The request does not match the documented shape.",
    ur: "درخواست دستاویزی ڈھانچے سے مطابقت نہیں رکھتی۔",
  },
  PROJECT_OS_API_CSV_CONTENT_TYPE: {
    ar: "ملف CSV يُرسل بنوع المحتوى text/csv.",
    en: "A CSV file is sent with the content type text/csv.",
    ur: "CSV فائل text/csv مواد کی قسم کے ساتھ بھیجی جاتی ہے۔",
  },
  PROJECT_OS_API_CSV_ENTITY_UNKNOWN: {
    ar: "نوع السجلات غير معروف لقالب CSV.",
    en: "That record type has no CSV template.",
    ur: "اس قسم کے ریکارڈ کا CSV ٹیمپلیٹ موجود نہیں ہے۔",
  },
  PROJECT_OS_CONNECTION_INACTIVE: {
    ar: "الاتصال معطّل؛ فعّله أولًا.",
    en: "The connection is switched off; switch it on first.",
    ur: "کنکشن بند ہے؛ پہلے اسے آن کریں۔",
  },
  PROJECT_OS_CONNECTION_NOT_FOUND: {
    ar: "الاتصال غير موجود.",
    en: "The connection does not exist.",
    ur: "یہ کنکشن موجود نہیں ہے۔",
  },
  PROJECT_OS_CONNECTION_PUSH_UNSUPPORTED: {
    ar: "هذا الموصل يقرأ فقط ولا يرسل إلى النظام الآخر؛ استعمل واجهة التصدير.",
    en: "This connector reads only and does not write to the other system; use the export API.",
    ur: "یہ کنیکٹر صرف پڑھتا ہے اور دوسرے سسٹم میں نہیں لکھتا؛ ایکسپورٹ API استعمال کریں۔",
  },
  PROJECT_OS_CONNECTION_SYSTEM_UNSUPPORTED: {
    ar: "لا يوجد موصل لهذا النظام.",
    en: "There is no connector for that system.",
    ur: "اس سسٹم کے لیے کوئی کنیکٹر موجود نہیں ہے۔",
  },
  PROJECT_OS_CONNECTION_URL_INVALID: {
    ar: "عنوان النظام غير مقبول (يجب أن يكون https وليس عنوانًا داخليًا).",
    en: "The system address is not accepted (it must be https and not an internal address).",
    ur: "سسٹم کا پتا قبول نہیں کیا گیا (یہ https ہونا چاہیے اور اندرونی پتا نہیں ہونا چاہیے)۔",
  },
  PROJECT_OS_NCR_OPEN_BLOCKS_ACCEPTANCE: {
    ar: "لا يُقبل الفحص: يوجد عدم مطابقة (NCR) مفتوح على هذه الوحدة وهذا النشاط. أغلقه أولًا.",
    en: "The inspection cannot be accepted: an NCR is open on this unit and activity. Close it first.",
    ur: "معائنہ قبول نہیں ہو سکتا: اس یونٹ اور سرگرمی پر NCR کھلا ہوا ہے۔ پہلے اسے بند کریں۔",
  },
  PROJECT_OS_WEBHOOK_EVENTS_INVALID: {
    ar: "أنواع الأحداث غير معروفة.",
    en: "The event types are not known.",
    ur: "واقعات کی قسمیں معلوم نہیں ہیں۔",
  },
  PROJECT_OS_WEBHOOK_NOT_FOUND: {
    ar: "نقطة الـWebhook غير موجودة.",
    en: "The webhook endpoint does not exist.",
    ur: "ویب ہُک اینڈ پوائنٹ موجود نہیں ہے۔",
  },
  PROJECT_OS_WEBHOOK_URL_INVALID: {
    ar: "عنوان الـWebhook غير صالح.",
    en: "The webhook address is not valid.",
    ur: "ویب ہُک کا پتا درست نہیں ہے۔",
  },
  PROJECT_OS_WEBHOOK_URL_NOT_HTTPS: {
    ar: "عنوان الـWebhook يجب أن يبدأ بـhttps.",
    en: "The webhook address must start with https.",
    ur: "ویب ہُک کا پتا https سے شروع ہونا چاہیے۔",
  },
  PROJECT_OS_WEBHOOK_URL_PRIVATE: {
    ar: "عنوان الـWebhook يشير إلى شبكة داخلية أو خاصة ولا يُقبل.",
    en: "The webhook address points inside a private network and is not accepted.",
    ur: "ویب ہُک کا پتا نجی نیٹ ورک کے اندر ہے اور قبول نہیں کیا جاتا۔",
  },
  PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK: {
    ar: "لا يمكن أن تؤدي الحركة إلى رصيد مخزون سالب.",
    en: "The movement cannot result in a negative stock balance.",
    ur: "یہ نقل و حرکت اسٹاک کا بقایا توازن منفی نہیں کر سکتی۔",
  },
  PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID: {
    ar: "أدخل كمية صرف موجبة (وتكلفة وحدة موجبة إن أدخلتها).",
    en: "Enter a positive issued quantity (and a positive unit cost if you enter one).",
    ur: "جاری کی گئی مثبت مقدار درج کریں (اور اگر قیمت درج کریں تو وہ بھی مثبت ہو)۔",
  },
  PROJECT_OS_MATERIAL_ISSUE_ACTIVITY_WBS_MISMATCH: {
    ar: "النشاط المحدد لا يتبع بند WBS المختار.",
    en: "The selected activity does not belong to the selected WBS item.",
    ur: "منتخب سرگرمی منتخب WBS آئٹم سے تعلق نہیں رکھتی۔",
  },
  PROJECT_OS_SUPPLIER_CODE_EXISTS: {
    ar: "رمز المورد مستخدم بالفعل ضمن مساحة العمل هذه.",
    en: "This supplier code is already in use in this workspace.",
    ur: "یہ سپلائر کوڈ اس ورک اسپیس میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_SUPPLIER_NOT_FOUND: {
    ar: "المورد المحدد غير متاح ضمن مساحة العمل هذه.",
    en: "The selected supplier is not available in this workspace.",
    ur: "منتخب کردہ سپلائر اس ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_SUPPLIER_INACTIVE: {
    ar: "لا يمكن إنشاء طلب توريد لمورد غير نشط.",
    en: "A procurement requisition cannot be created for an inactive supplier.",
    ur: "غیر فعال سپلائر کے لیے خریداری کی درخواست نہیں بنائی جا سکتی۔",
  },
  PROJECT_OS_REQUISITION_NUMBER_EXISTS: {
    ar: "رقم طلب المواد مستخدم بالفعل ضمن هذا المشروع.",
    en: "This procurement requisition number is already in use in this project.",
    ur: "خریداری کی درخواست کا یہ نمبر اس پروجیکٹ میں پہلے ہی استعمال ہو چکا ہے۔",
  },
  PROJECT_OS_REQUISITION_NOT_FOUND: {
    ar: "طلب المواد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected procurement requisition is not available in the current project and workspace.",
    ur: "منتخب کردہ خریداری کی درخواست موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_REQUISITION_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب المواد المحدد غير مسموح من حالته الحالية.",
    en: "The requested procurement requisition transition is not allowed from its current status.",
    ur: "درخواست کردہ خریداری کی درخواست کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_REQUISITION_ISSUE_INVALID: {
    ar: "يجب أن يكون صرف طلب المواد بحركة صرف سالبة فقط.",
    en: "A material request can only be linked to a negative issue movement.",
    ur: "مواد کی درخواست کو صرف منفی اجرا کی نقل و حرکت سے جوڑا جا سکتا ہے۔",
  },
  PROJECT_OS_REQUISITION_MATERIAL_MISMATCH: {
    ar: "المادة المصروفة لا تطابق مادة طلب المواد المحدد.",
    en: "The issued material does not match the selected material request.",
    ur: "جاری کیا گیا مادّہ منتخب مواد کی درخواست کے مادّے سے مطابقت نہیں رکھتا۔",
  },
  PROJECT_OS_REQUISITION_NOT_ISSUABLE: {
    ar: "لا يمكن صرف هذا الطلب قبل اعتماده أو بعد إغلاقه.",
    en: "This request cannot be issued before approval or after closure.",
    ur: "منظوری سے پہلے یا بند ہونے کے بعد یہ درخواست جاری نہیں کی جا سکتی۔",
  },
  PROJECT_OS_REQUISITION_ISSUE_EXCEEDS_REQUEST: {
    ar: "كمية الصرف تتجاوز الكمية المطلوبة في طلب المواد.",
    en: "The issue quantity exceeds the quantity requested.",
    ur: "جاری کی گئی مقدار درخواست کی گئی مقدار سے زیادہ ہے۔",
  },
  PROJECT_OS_REQUISITION_CLOSURE_NOT_FULFILLED: {
    ar: "لا يمكن إغلاق طلب المواد قبل صرف كامل كميته المطلوبة.",
    en: "A material request cannot be closed until its full requested quantity is issued.",
    ur: "مواد کی درخواست اس وقت تک بند نہیں ہو سکتی جب تک پوری درخواست کی گئی مقدار جاری نہ ہو جائے۔",
  },
  PROJECT_OS_REQUISITION_UNIT_MISMATCH: {
    ar: "وحدة قياس الطلب لا تطابق وحدة المادة المعتمدة.",
    en: "The request unit of measure does not match the approved material unit.",
    ur: "درخواست کی پیمائش کی اکائی منظور شدہ مادّے کی اکائی سے مطابقت نہیں رکھتی۔",
  },
  PROJECT_OS_REQUISITION_PURCHASE_ORDER_LINK_INVALID: {
    ar: "لا يمكن ربط أمر شراء إلا بطلب مواد معتمد غير مصروف.",
    en: "A purchase order can only be linked to an approved, unissued material request.",
    ur: "خریداری کا آرڈر صرف منظور شدہ اور ابھی جاری نہ ہونے والی مواد کی درخواست سے جوڑا جا سکتا ہے۔",
  },
  PROJECT_OS_REQUISITION_PURCHASE_ORDER_ALREADY_LINKED: {
    ar: "هذا الطلب مرتبط بالفعل بأمر شراء ولا يمكن ربطه مرة أخرى.",
    en: "This request is already linked to a purchase order and cannot be linked again.",
    ur: "یہ درخواست پہلے ہی ایک خریداری کے آرڈر سے جڑی ہوئی ہے اور دوبارہ نہیں جوڑی جا سکتی۔",
  },
  PROJECT_OS_PURCHASE_ORDER_NOT_LINKABLE: {
    ar: "أمر الشراء المحدد ليس في حالة تسمح بربطه بطلب المواد.",
    en: "The selected purchase order is not in a state that allows linking to a material request.",
    ur: "منتخب خریداری کا آرڈر ایسی حالت میں نہیں ہے جو مواد کی درخواست سے جوڑنے کی اجازت دے۔",
  },
  PROJECT_OS_GRN_QUANTITY_INVALID: {
    ar: "أدخل كمية مقبولة أو مرفوضة واحدة على الأقل بقيم غير سالبة.",
    en: "Enter at least one accepted or rejected quantity using non-negative values.",
    ur: "کم از کم ایک قبول یا مسترد شدہ مقدار درج کریں، جو منفی نہ ہو۔",
  },
  PROJECT_OS_GRN_REJECTION_EVIDENCE_REQUIRED: {
    ar: "الكمية المرفوضة تتطلب فحص جودة وNCR من المشروع نفسه.",
    en: "A rejected quantity requires a quality inspection and NCR from the same project.",
    ur: "مسترد شدہ مقدار کے لیے اسی پروجیکٹ کا معیار کا معائنہ اور NCR درکار ہے۔",
  },
  PROJECT_OS_GRN_REJECTION_EVIDENCE_NOT_ALLOWED: {
    ar: "لا تسجل أدلة رفض عندما تكون كمية الرفض صفرًا.",
    en: "Rejection evidence cannot be recorded when the rejected quantity is zero.",
    ur: "جب مسترد شدہ مقدار صفر ہو تو مسترد ہونے کا ثبوت درج نہیں ہو سکتا۔",
  },
  PROJECT_OS_GRN_PURCHASE_ORDER_NOT_ISSUED: {
    ar: "يجب أن يكون أمر الشراء صادرًا قبل تسجيل استلام المواد.",
    en: "The purchase order must be issued before recording a goods receipt.",
    ur: "وصولی کا ریکارڈ درج کرنے سے پہلے خریداری کا آرڈر جاری ہونا چاہیے۔",
  },
  PROJECT_OS_GRN_QUALITY_EVIDENCE_INVALID: {
    ar: "فحص الجودة المحدد غير مقبول كدليل لكمية مرفوضة.",
    en: "The selected quality inspection is not valid evidence for a rejected quantity.",
    ur: "منتخب معیار کا معائنہ مسترد مقدار کے لیے درست ثبوت نہیں ہے۔",
  },
  PROJECT_OS_GRN_NCR_EVIDENCE_INVALID: {
    ar: "حالة عدم المطابقة المحددة غير مفتوحة لمعالجة الكمية المرفوضة.",
    en: "The selected NCR is not open for the rejected quantity.",
    ur: "منتخب NCR مسترد مقدار کے لیے کھلا نہیں ہے۔",
  },
  PROJECT_OS_CLAIM_NOT_FOUND: {
    ar: "المطالبة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected claim is not available in the current project and workspace.",
    ur: "منتخب کردہ دعویٰ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_CLAIM_TRANSITION_INVALID: {
    ar: "انتقال حالة المطالبة المحدد غير مسموح من حالتها الحالية.",
    en: "The selected claim-status transition is not allowed from its current status.",
    ur: "منتخب کردہ دعوے کی حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_CLAIM_APPROVAL_AMOUNT_REQUIRED: {
    ar: "يلزم إدخال قيمة معتمدة عند اعتماد المطالبة.",
    en: "An approved amount is required when approving a claim.",
    ur: "دعوے کی منظوری کے وقت منظور شدہ رقم درکار ہے۔",
  },
  PROJECT_OS_CLAIM_APPROVAL_EXCEEDS_CLAIM: {
    ar: "لا يمكن أن تتجاوز القيمة المعتمدة قيمة المطالبة المطلوبة.",
    en: "The approved amount cannot exceed the claimed amount.",
    ur: "منظور شدہ رقم دعوے کی رقم سے زیادہ نہیں ہو سکتی۔",
  },
  PROJECT_OS_ADVISOR_UNAVAILABLE: {
    ar: "تعذر إنشاء النصيحة الاستشارية الآن. لا يغير ذلك أي بيانات للمشروع.",
    en: "The advisory could not be generated now. No project data was changed.",
    ur: "مشورہ ابھی تیار نہیں ہو سکا۔ پروجیکٹ کا کوئی ڈیٹا تبدیل نہیں ہوا۔",
  },
  PROJECT_OS_ACTIVITY_NOT_FOUND: {
    ar: "النشاط غير موجود في هذا المشروع.",
    en: "The activity was not found in this project.",
    ur: "یہ سرگرمی اس پروجیکٹ میں نہیں ملی۔",
  },
  PROJECT_OS_ACTIVITY_WBS_MISMATCH: {
    ar: "النشاط لا يتبع بند العمل المختار.",
    en: "The activity does not belong to the selected work item.",
    ur: "یہ سرگرمی منتخب کام کے آئٹم سے تعلق نہیں رکھتی۔",
  },
  PROJECT_OS_ASSIGNMENT_WINDOW_INVALID: {
    ar: "فترة الإسناد غير صالحة: يجب ألا تسبق النهاية البداية.",
    en: "The assignment window is invalid: the end must not be before the start.",
    ur: "تفویض کا دورانیہ درست نہیں: اختتام ابتدا سے پہلے نہیں ہو سکتا۔",
  },
  PROJECT_OS_ATTENDANCE_NOT_FOUND: {
    ar: "سجل الحضور غير موجود.",
    en: "The attendance record was not found.",
    ur: "حاضری کا ریکارڈ نہیں ملا۔",
  },
  PROJECT_OS_AUTH_FAILED: {
    ar: "تعذّر تسجيل الدخول. حاول مرة أخرى.",
    en: "Sign-in failed. Please try again.",
    ur: "لاگ ان ناکام ہوا۔ دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_AUTH_RATE_LIMITED: {
    ar: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
    en: "Too many attempts. Wait a moment and try again.",
    ur: "بہت زیادہ کوششیں۔ کچھ دیر انتظار کریں اور دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_BOQ_CODE_EXISTS: {
    ar: "رمز بند جدول الكميات مستعمل في هذا المشروع.",
    en: "This BOQ item code is already used in this project.",
    ur: "BOQ آئٹم کا یہ کوڈ اس پروجیکٹ میں پہلے ہی استعمال ہو رہا ہے۔",
  },
  PROJECT_OS_CERTIFICATE_NUMBER_EXISTS: {
    ar: "رقم المستخلص مستعمل في هذا المشروع.",
    en: "This certificate number is already used in this project.",
    ur: "سرٹیفکیٹ کا یہ نمبر اس پروجیکٹ میں پہلے ہی استعمال ہو چکا ہے۔",
  },
  PROJECT_OS_DASHBOARD_OWNER_NOT_FOUND: {
    ar: "لا مستلم مؤهل لهذا التنبيه في الشركة.",
    en: "No eligible recipient for this alert was found in the company.",
    ur: "کمپنی میں اس الرٹ کا کوئی اہل وصول کنندہ نہیں ملا۔",
  },
  PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED: {
    ar: "الإسناد يتجاوز طاقة الموظف في هذه الفترة.",
    en: "The assignment exceeds the employee's capacity for this period.",
    ur: "یہ تفویض اس مدت کے لیے ملازم کی گنجائش سے زیادہ ہے۔",
  },
  PROJECT_OS_EMPLOYEE_NOT_ACTIVE: {
    ar: "الموظف غير فعّال.",
    en: "The employee is not active.",
    ur: "ملازم فعال نہیں ہے۔",
  },
  PROJECT_OS_EXPORT_FILE_TOO_LARGE: {
    ar: "ملف التصدير أكبر من الحد المسموح (10 ميغابايت).",
    en: "The export file is larger than the allowed limit (10 MB).",
    ur: "ایکسپورٹ فائل اجازت شدہ حد (10 MB) سے بڑی ہے۔",
  },
  PROJECT_OS_GRN_COMMITMENT_INSUFFICIENT: {
    ar: "قيمة الاستلام تتجاوز الرصيد المفتوح من الالتزام.",
    en: "The receipt value exceeds the open balance of the commitment.",
    ur: "وصولی کی قیمت وعدے کے کھلے بقایا سے زیادہ ہے۔",
  },
  PROJECT_OS_GRN_COMMITMENT_INVALID: {
    ar: "التزام أمر الشراء غير معتمد أو بعملة مختلفة.",
    en: "The purchase order's commitment is not approved or is in a different currency.",
    ur: "خریداری کے آرڈر کا وعدہ منظور شدہ نہیں یا مختلف کرنسی میں ہے۔",
  },
  PROJECT_OS_GRN_PURCHASE_ORDER_COMMITMENT_REQUIRED: {
    ar: "أمر الشراء بلا التزام؛ اربطه بالتزام قبل تسجيل الاستلام.",
    en: "The purchase order has no commitment; link one before recording a receipt.",
    ur: "خریداری کے آرڈر کا کوئی وعدہ نہیں ہے؛ وصولی درج کرنے سے پہلے ایک وعدہ جوڑیں۔",
  },
  PROJECT_OS_GRN_UNIT_COST_INVALID: {
    ar: "تكلفة الوحدة يجب أن تكون رقمًا أكبر من صفر.",
    en: "The unit cost must be a number above zero.",
    ur: "اکائی کی لاگت صفر سے زیادہ عدد ہونی چاہیے۔",
  },
  PROJECT_OS_IMPORT_DUPLICATE_DETECTED: {
    ar: "هذا الملف مستورد سابقًا في هذا المشروع.",
    en: "This file was already imported into this project.",
    ur: "یہ فائل اس پروجیکٹ میں پہلے ہی درآمد ہو چکی ہے۔",
  },
  PROJECT_OS_CONSULTANT_EXPORT_NOT_RECOGNISED: {
    ar: "لم نتعرّف على هذا الملف كتصدير من نظام الاستشاري (نبحث عن صف فيه Zone وBlock وUnit وVilla Type، ثم الأنشطة ورقم WIR لكل نشاط).",
    en: "This file was not recognised as the consultant's export (we look for a row with Zone, Block, Unit and Villa Type, then the activities with a WIR number each).",
    ur: "اس فائل کو مشیر کے نظام کی برآمد کے طور پر نہیں پہچانا گیا (ہم Zone، Block، Unit اور Villa Type والی قطار اور ہر سرگرمی کا WIR نمبر تلاش کرتے ہیں)۔",
  },
  PROJECT_OS_SITE_WORKBOOK_NOT_RECOGNISED: {
    ar: "لم نتعرّف على هذا الملف كملف الموقع القديم (نبحث عن ورقة Weights وورقة Progress أو Progress Log).",
    en: "This file was not recognised as the site's old workbook (we look for a Weights sheet and a Progress or Progress Log sheet).",
    ur: "اس فائل کو سائٹ کی پرانی ورک بک کے طور پر نہیں پہچانا گیا (ہم Weights اور Progress یا Progress Log شیٹ تلاش کرتے ہیں)۔",
  },
  PROJECT_OS_SITE_LEGACY_ALREADY_IMPORTED: {
    ar: "سجل الموقع القديم استُورد من قبل في هذا المشروع، ولا يُستورد مرتين.",
    en: "The site's old record was already imported into this project; it is imported only once.",
    ur: "سائٹ کا پرانا ریکارڈ اس پروجیکٹ میں پہلے ہی درآمد ہو چکا ہے؛ یہ صرف ایک بار درآمد ہوتا ہے۔",
  },
  PROJECT_OS_SITE_UPDATE_INVALID: {
    ar: "لم يُحفظ شيء: في الإدخال ما يجب تصحيحه (فيلا غير موجودة، أو تاريخ في المستقبل، أو حقل ناقص، أو نشاط لا ينطبق على نموذج الفيلا). التفاصيل تحت النموذج.",
    en: "Nothing was saved: something in the entry must be corrected (a villa that does not exist, a date in the future, a missing field, or an activity that does not apply to the villa's type). The details are under the form.",
    ur: "کچھ محفوظ نہیں ہوا: اندراج میں کچھ درست کرنا ہے (غیر موجود ولا، مستقبل کی تاریخ، خالی خانہ، یا ایسی سرگرمی جو ولا کی قسم پر لاگو نہیں)۔ تفصیل فارم کے نیچے ہے۔",
  },
  PROJECT_OS_PMC_SITE_ACTIVITY_NOT_FOUND: {
    ar: "نشاط الموقع غير موجود في هذا المشروع.",
    en: "The site activity was not found in this project.",
    ur: "سائٹ کی سرگرمی اس پروجیکٹ میں نہیں ملی۔",
  },
  PROJECT_OS_PMC_DIFFERENCE_CHANGED: {
    ar: "تغيّر بعض الفروقات منذ فتحت الشاشة (عولج أو تغيّرت حالته)، فلم يُطبَّق شيء. حدّث القائمة ثم أعد الاختيار.",
    en: "Some differences changed since the screen was opened (handled or changed state), so nothing was applied. Refresh the list and choose again.",
    ur: "اسکرین کھلنے کے بعد کچھ فرق بدل گئے، اس لیے کچھ لاگو نہیں ہوا۔ فہرست تازہ کریں اور دوبارہ منتخب کریں۔",
  },
  PROJECT_OS_PMC_DIFFERENCE_NOT_FOUND: {
    ar: "اختر فرقًا واحدًا على الأقل.",
    en: "Choose at least one difference.",
    ur: "کم از کم ایک فرق منتخب کریں۔",
  },
  PROJECT_OS_IMPORT_DISCARD_NOT_ALLOWED: {
    ar: "لا يمكن حذف هذه المحاولة: هي مستورَدة فعلًا أو قيد المعالجة. للمستورَد استعمل «تراجع عن هذا الاستيراد».",
    en: "This attempt cannot be deleted: it was already imported or is being processed. For an imported one use \"Roll back this import\".",
    ur: "اس کوشش کو حذف نہیں کیا جا سکتا: یہ درآمد ہو چکی ہے یا عمل میں ہے۔ درآمد شدہ کے لیے \"اس درآمد کو واپس کریں\" استعمال کریں۔",
  },
  PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED: {
    ar: "التراجع ممكن فقط عن استيراد مُكتمل لم يُتراجع عنه من قبل.",
    en: "Only a completed import that has not been rolled back can be rolled back.",
    ur: "صرف مکمل درآمد کو واپس کیا جا سکتا ہے جسے پہلے واپس نہ کیا گیا ہو۔",
  },
  PROJECT_OS_IMPORT_ROLLBACK_MODULE_UNSUPPORTED: {
    ar: "لا يمكن التراجع عن هذا النوع من الاستيراد (الأرصدة الافتتاحية سجل حركات مخزون لا يُمحى).",
    en: "This kind of import cannot be rolled back (opening balances are a stock-movement ledger that is never erased).",
    ur: "اس قسم کی درآمد واپس نہیں کی جا سکتی (ابتدائی بیلنس اسٹاک حرکات کا ریکارڈ ہے جو مٹایا نہیں جاتا)۔",
  },
  PROJECT_OS_IMPORT_ROLLBACK_HAS_UPDATES: {
    ar: "هذا الاستيراد عدّل صفوفًا كانت موجودة، ولم تُحفظ قيمها السابقة، فلا يمكن إعادتها. استورد النسخة الصحيحة فوقه بدل التراجع.",
    en: "This import changed rows that already existed and their previous values were not kept, so they cannot be restored. Import the correct version over it instead.",
    ur: "اس درآمد نے پہلے سے موجود قطاریں بدلی تھیں اور ان کی پچھلی قدریں محفوظ نہیں، اس لیے بحال نہیں ہو سکتیں۔ واپسی کے بجائے درست نسخہ اوپر درآمد کریں۔",
  },
  PROJECT_OS_IMPORT_ROLLBACK_IN_USE: {
    ar: "لا يمكن التراجع: عناصر أنشأها هذا الاستيراد صارت مستعملة في مكان آخر (ولم يُحذف شيء).",
    en: "Cannot roll back: items this import created are now used elsewhere (nothing was deleted).",
    ur: "واپسی ممکن نہیں: اس درآمد کی بنائی ہوئی چیزیں اب کہیں اور استعمال ہو رہی ہیں (کچھ حذف نہیں ہوا)۔",
  },
  PROJECT_OS_IMPORT_ROLLBACK_INCOMPLETE_RECORD: {
    ar: "سجل هذا الاستيراد لا يطابق البيانات الحالية (صف أنشأه غير موجود)، فلم يُحذف شيء.",
    en: "This import's record no longer matches the data (a row it created is gone), so nothing was deleted.",
    ur: "اس درآمد کا ریکارڈ موجودہ ڈیٹا سے مطابقت نہیں رکھتا، اس لیے کچھ حذف نہیں ہوا۔",
  },
  PROJECT_OS_UPLOAD_TYPE_INVALID: {
    ar: "نوع الملف غير مقبول لهذا الرفع.",
    en: "This file type is not accepted for this upload.",
    ur: "اس اپ لوڈ کے لیے یہ فائل کی قسم قبول نہیں ہے۔",
  },
  PROJECT_OS_IMPORT_CONTEXT_REQUIRED: {
    ar: "اختر إصدار الخطة الرئيسية الذي يخصه الملف قبل الرفع.",
    en: "Choose the master-plan version the file belongs to before uploading.",
    ur: "اپ لوڈ سے پہلے منتخب کریں کہ فائل ماسٹر پلان کے کس ورژن سے متعلق ہے۔",
  },
  PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM: {
    ar: "الملف سليم لكنه لا يغيّر شيئًا: المشروع يحمل هذه البيانات بالفعل.",
    en: "The file is valid but changes nothing: the project already holds this data.",
    ur: "فائل درست ہے مگر اس سے کچھ تبدیل نہیں ہوتا: پروجیکٹ میں یہ ڈیٹا پہلے سے موجود ہے۔",
  },
  PROJECT_OS_IMPORT_VERSION_CONFLICT: {
    ar: "تغيّر صف واحد على الأقل في المنصة منذ تصدير الملف، أو أُعيد ترميزه في الملف. صدِّر الملف من جديد وأعد تطبيق تعديلاتك، فلا يُكتب شيء فوق عمل أحدث.",
    en: "At least one row changed in the platform since this file was exported, or was re-keyed in the file. Export again and re-apply your edits; nothing is written over newer work.",
    ur: "فائل کی برآمد کے بعد پلیٹ فارم میں کم از کم ایک قطار تبدیل ہو چکی ہے، یا فائل میں دوبارہ درج کی گئی ہے۔ دوبارہ ایکسپورٹ کریں اور اپنی تبدیلیاں دوبارہ لاگو کریں؛ نئے کام پر کچھ نہیں لکھا جاتا۔",
  },
  PROJECT_OS_IMPORT_DIFF_CHANGED: {
    ar: "تغيّرت الفروق منذ أن راجعتها. راجع المعاينة من جديد ثم أكّد.",
    en: "The differences changed since you reviewed them. Review the preview again, then confirm.",
    ur: "آپ کے جائزے کے بعد فرق بدل چکے ہیں۔ پیش نظارہ دوبارہ دیکھیں، پھر تصدیق کریں۔",
  },
  PROJECT_OS_IMPORT_DIFF_UNAVAILABLE: {
    ar: "معاينة الفروق غير متاحة قبل نجاح التحقق من الملف.",
    en: "The difference preview is not available until the file passes validation.",
    ur: "فائل کی توثیق کامیاب ہونے تک فرق کا پیش نظارہ دستیاب نہیں ہے۔",
  },
  PROJECT_OS_IMPORT_FILE_INVALID: {
    ar: "الملف غير صالح أو غير مقروء.",
    en: "The file is invalid or unreadable.",
    ur: "فائل درست نہیں یا پڑھی نہیں جا سکتی۔",
  },
  PROJECT_OS_IMPORT_FILE_UNAVAILABLE: {
    ar: "تعذّر قراءة الملف المرفوع من التخزين.",
    en: "The uploaded file could not be read from storage.",
    ur: "اپ لوڈ کی گئی فائل اسٹوریج سے نہیں پڑھی جا سکی۔",
  },
  PROJECT_OS_IMPORT_FILE_TOO_LARGE: {
    ar: "حجم الملف أكبر من الحد المسموح به وهو 50 MB.",
    en: "The file is larger than the 50 MB limit.",
    ur: "فائل 50 MB کی حد سے بڑی ہے۔",
  },
  PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED: {
    ar: "هذا النوع من الملفات لا يُقرأ هنا. المقبول: Excel وCSV وXER، وPDF وصور المسح عند تفعيل القراءة الذكية.",
    en: "This file type cannot be read here. Accepted: Excel, CSV and XER, and PDF or scanned images when smart reading is on.",
    ur: "This file type cannot be read here. Accepted: Excel, CSV and XER, and PDF or scanned images when smart reading is on.",
  },
  PROJECT_OS_SMART_IMPORT_KIND_INVALID: {
    ar: "نوع الملف غير معروف. اختر نوعًا من القائمة.",
    en: "The file type is not recognised. Pick one from the list.",
    ur: "The file type is not recognised. Pick one from the list.",
  },
  PROJECT_OS_SMART_IMPORT_NO_IMPORTER: {
    ar: "هذا النوع (المستخلص أو التقرير اليومي) يُتعرَّف عليه لكن لا يوجد له استيراد بعد. لم يُكتب شيء.",
    en: "This type (payment certificate or daily report) is recognised but has no importer yet. Nothing was written.",
    ur: "This type (payment certificate or daily report) is recognised but has no importer yet. Nothing was written.",
  },
  PROJECT_OS_SMART_IMPORT_NO_TABLE: {
    ar: "لم أجد جدولًا في الملف. تأكد من أنه يحوي سطر عناوين وصفوف بيانات.",
    en: "No table was found in the file. Check that it has a header row and data rows.",
    ur: "No table was found in the file. Check that it has a header row and data rows.",
  },
  PROJECT_OS_SMART_IMPORT_REQUIRED_UNMAPPED: {
    ar: "بقي عمود مطلوب بلا مقابل. اربطه بعمود من الملف ثم اعتمد.",
    en: "A required field has no column. Map it to a column of the file, then approve.",
    ur: "A required field has no column. Map it to a column of the file, then approve.",
  },
  PROJECT_OS_SMART_IMPORT_NOTHING_TO_IMPORT: {
    ar: "لا يوجد صف صالح للاستيراد بعد استبعاد الصفوف الناقصة. لم يُكتب شيء.",
    en: "No row is valid for import once the incomplete ones are set aside. Nothing was written.",
    ur: "No row is valid for import once the incomplete ones are set aside. Nothing was written.",
  },
  PROJECT_OS_SMART_READING_DISABLED: {
    ar: "هذا النوع يحتاج تفعيل القراءة الذكية.",
    en: "This type needs smart reading to be turned on.",
    ur: "This type needs smart reading to be turned on.",
  },
  PROJECT_OS_SMART_READING_CAP_REACHED: {
    ar: "بلغت الشركة سقف القراءة الذكية لهذا الشهر. يُستأنف مطلع الشهر القادم أو يرفعه المالك.",
    en: "The company reached this month's smart-reading cap. It resumes next month, or the owner can raise it.",
    ur: "The company reached this month's smart-reading cap. It resumes next month, or the owner can raise it.",
  },
  PROJECT_OS_SMART_READING_UNREADABLE: {
    ar: "تعذّرت قراءة جدول من هذا الملف. جرّب ملفًا أوضح أو Excel.",
    en: "A table could not be read from this file. Try a clearer file or Excel.",
    ur: "A table could not be read from this file. Try a clearer file or Excel.",
  },
  PROJECT_OS_MATRIX_NOT_RECOGNISED: {
    ar: "لم يُتعرَّف على شكل مصفوفة إنجاز الوحدات في هذا الملف. لم يُكتب شيء.",
    en: "The unit-completion matrix shape was not recognised in this file. Nothing was written.",
    ur: "The unit-completion matrix shape was not recognised in this file. Nothing was written.",
  },
  MATRIX_WEIGHTS_NOT_100: {
    ar: "أوزان الأنشطة لا يبلغ مجموعها 100%. صحّح الصف الذي يحمل الأوزان في الملف ثم أعد الرفع.",
    en: "The activity weights do not total 100%. Correct the weights row in the file and upload again.",
    ur: "The activity weights do not total 100%. Correct the weights row in the file and upload again.",
  },
  MATRIX_ORACLE_CODE_DUPLICATE: {
    ar: "كود Oracle مكرر بين وحدتين في الملف.",
    en: "The same Oracle code appears on two units in the file.",
    ur: "The same Oracle code appears on two units in the file.",
  },
  MATRIX_ORACLE_CODE_ALREADY_USED: {
    ar: "كود Oracle مستعمل لوحدة أخرى في المشروع.",
    en: "The Oracle code is already used by another unit in the project.",
    ur: "The Oracle code is already used by another unit in the project.",
  },
  MATRIX_ORACLE_CODE_CHANGE_BLOCKED: {
    ar: "وحدة لها كود Oracle مختلف عمّا في الملف؛ لا يُغيَّر كود الربط بصمت.",
    en: "A unit already has a different Oracle code than the file's; the linking code is never changed silently.",
    ur: "A unit already has a different Oracle code than the file's; the linking code is never changed silently.",
  },
  PROJECT_OS_SCHEDULE_UPDATE_NOT_RECOGNISED: {
    ar: "لم يُتعرَّف على تحديث أنشطة في هذا الملف: يلزم عمود «Activity ID» وعمود «(*)Start» أو «(*)Finish».",
    en: "No activity update was recognised in this file: it needs an «Activity ID» column and a «(*)Start» or «(*)Finish» column.",
    ur: "No activity update was recognised in this file: it needs an «Activity ID» column and a «(*)Start» or «(*)Finish» column.",
  },
  PROJECT_OS_IMPORT_JOB_FAILED: {
    ar: "تعذّر إكمال المعالجة لسبب غير متوقع. لم يُحفظ شيء؛ أعد المحاولة، وإن تكرر فتواصل مع الدعم.",
    en: "Processing could not finish because of an unexpected problem. Nothing was saved; try again, and contact support if it repeats.",
    ur: "غیر متوقع مسئلے کی وجہ سے کارروائی مکمل نہ ہو سکی۔ کچھ محفوظ نہیں ہوا؛ دوبارہ کوشش کریں، اور مسئلہ بار بار ہو تو سپورٹ سے رابطہ کریں۔",
  },
  PROJECT_OS_IMPORT_JOB_STALLED: {
    ar: "توقفت المعالجة قبل اكتمالها ولم تنجح إعادة تشغيلها. لم يُحفظ شيء؛ أعد المحاولة.",
    en: "Processing stopped before it finished and could not be restarted. Nothing was saved; try again.",
    ur: "مکمل ہونے سے پہلے کارروائی رک گئی اور دوبارہ شروع نہیں ہو سکی۔ کچھ محفوظ نہیں ہوا؛ دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID: {
    ar: "مرجع الملف المرفوع لا يخص هذا المشروع.",
    en: "The uploaded file reference does not belong to this project.",
    ur: "اپ لوڈ کی گئی فائل کا حوالہ اس پروجیکٹ کا نہیں ہے۔",
  },
  PROJECT_OS_IMPORT_UPLOAD_MISSING: {
    ar: "لم يصل الملف إلى التخزين. أعد رفعه.",
    en: "The file did not reach storage. Upload it again.",
    ur: "فائل اسٹوریج تک نہیں پہنچی۔ اسے دوبارہ اپ لوڈ کریں۔",
  },
  PROJECT_OS_IMPORT_FORMAT_INVALID: {
    ar: "صيغة الملف غير مدعومة.",
    en: "The file format is not supported.",
    ur: "فائل کا فارمیٹ معاون نہیں ہے۔",
  },
  PROJECT_OS_IMPORT_MAPPING_INVALID: {
    ar: "ربط الأعمدة غير صالح.",
    en: "The column mapping is invalid.",
    ur: "کالموں کی میپنگ درست نہیں ہے۔",
  },
  PROJECT_OS_IMPORT_MODULE_INVALID: {
    ar: "نوع الاستيراد غير معروف.",
    en: "The import type is not recognised.",
    ur: "درآمد کی قسم پہچانی نہیں گئی۔",
  },
  PROJECT_OS_IMPORT_NOT_CONFIRMABLE: {
    ar: "لا يمكن اعتماد هذا الاستيراد في حالته الحالية.",
    en: "This import cannot be confirmed in its current state.",
    ur: "یہ درآمد اپنی موجودہ حالت میں تصدیق نہیں ہو سکتی۔",
  },
  PROJECT_OS_IMPORT_NOT_FOUND: {
    ar: "عملية الاستيراد غير موجودة.",
    en: "The import was not found.",
    ur: "درآمد نہیں ملی۔",
  },
  PROJECT_OS_IMPORT_VALIDATION_FAILED: {
    ar: "الملف لم يجتز الفحص؛ راجع تقرير الأخطاء ولم يُحفظ شيء.",
    en: "The file did not pass validation; see the error report. Nothing was saved.",
    ur: "فائل توثیق میں ناکام رہی؛ خرابی کی رپورٹ دیکھیں۔ کچھ محفوظ نہیں ہوا۔",
  },
  PROJECT_OS_INVENTORY_TRANSFER_QUANTITY_INVALID: {
    ar: "كمية التحويل يجب أن تكون أكبر من صفر.",
    en: "The transfer quantity must be above zero.",
    ur: "منتقلی کی مقدار صفر سے زیادہ ہونی چاہیے۔",
  },
  PROJECT_OS_INVENTORY_TRANSFER_SAME_WAREHOUSE: {
    ar: "مستودع المصدر والوجهة متطابقان.",
    en: "The source and destination warehouses are the same.",
    ur: "ماخذ اور منزل کا گودام ایک ہی ہے۔",
  },
  PROJECT_OS_INVOICE_NUMBER_EXISTS: {
    ar: "رقم الفاتورة مستعمل في هذا المشروع.",
    en: "This invoice number is already used in this project.",
    ur: "انوائس کا یہ نمبر اس پروجیکٹ میں پہلے ہی استعمال ہو چکا ہے۔",
  },
  PROJECT_OS_LABOR_RESOURCE_REQUIRED: {
    ar: "يجب أن يكون المورد المختار من نوع عمالة.",
    en: "The selected resource must be a labour resource.",
    ur: "منتخب وسیلہ لیبر کا وسیلہ ہونا چاہیے۔",
  },
  PROJECT_OS_MASTER_PLAN_RULES_INVALID: {
    ar: "قواعد الخطة الرئيسية غير صالحة.",
    en: "The master plan rules are invalid.",
    ur: "ماسٹر پلان کے قواعد درست نہیں ہیں۔",
  },
  PROJECT_OS_MASTER_PLAN_RULE_SAVE_FAILED: {
    ar: "تعذّر حفظ قاعدة الخطة الرئيسية.",
    en: "The master plan rule could not be saved.",
    ur: "ماسٹر پلان کا قاعدہ محفوظ نہیں ہو سکا۔",
  },
  PROJECT_OS_NOTIFICATION_NOT_FOUND: {
    ar: "التنبيه غير موجود.",
    en: "The notification was not found.",
    ur: "اطلاع نہیں ملی۔",
  },
  PROJECT_OS_OPERATIONAL_ROLE_CATALOG_INVALID: {
    ar: "كتالوج الأدوار التشغيلية غير مكتمل؛ تواصل مع الدعم.",
    en: "The operational role catalogue is incomplete; contact support.",
    ur: "آپریشنل کرداروں کا کیٹلاگ نامکمل ہے؛ سپورٹ سے رابطہ کریں۔",
  },
  PROJECT_OS_PAYROLL_ALLOCATION_EXCEEDS_COST: {
    ar: "مجموع التخصيصات يتجاوز تكلفة الراتب.",
    en: "The allocations exceed the payroll cost.",
    ur: "مختص رقمیں تنخواہ کی لاگت سے زیادہ ہیں۔",
  },
  PROJECT_OS_PAYROLL_AMOUNT_INVALID: {
    ar: "مبلغ الراتب غير صالح.",
    en: "The payroll amount is invalid.",
    ur: "تنخواہ کی رقم درست نہیں ہے۔",
  },
  PROJECT_OS_PAYROLL_APPROVER_SEPARATION: {
    ar: "لا يعتمد مسير الرواتب من أنشأه.",
    en: "A payroll run cannot be approved by the person who created it.",
    ur: "تنخواہ کا رن وہ شخص منظور نہیں کر سکتا جس نے اسے بنایا ہو۔",
  },
  PROJECT_OS_PAYROLL_ENTRY_NOT_FOUND: {
    ar: "بند الراتب غير موجود.",
    en: "The payroll entry was not found.",
    ur: "تنخواہ کا اندراج نہیں ملا۔",
  },
  PROJECT_OS_PAYROLL_NOT_APPROVED: {
    ar: "مسير الرواتب غير معتمد بعد.",
    en: "The payroll run is not approved yet.",
    ur: "تنخواہ کا رن ابھی منظور نہیں ہوا۔",
  },
  PROJECT_OS_PAYROLL_PERIOD_EXISTS: {
    ar: "يوجد مسير رواتب لهذه الفترة.",
    en: "A payroll run already exists for this period.",
    ur: "اس مدت کے لیے تنخواہ کا رن پہلے ہی موجود ہے۔",
  },
  PROJECT_OS_PAYROLL_PERIOD_INVALID: {
    ar: "فترة الرواتب غير صالحة.",
    en: "The payroll period is invalid.",
    ur: "تنخواہ کی مدت درست نہیں ہے۔",
  },
  PROJECT_OS_PAYROLL_RUN_NOT_FOUND: {
    ar: "مسير الرواتب غير موجود.",
    en: "The payroll run was not found.",
    ur: "تنخواہ کا رن نہیں ملا۔",
  },
  PROJECT_OS_PAYROLL_STRUCTURE_INVALID: {
    ar: "هيكل الراتب غير صالح.",
    en: "The salary structure is invalid.",
    ur: "تنخواہ کا ڈھانچہ درست نہیں ہے۔",
  },
  PROJECT_OS_PAYROLL_TRANSITION_INVALID: {
    ar: "لا يمكن نقل المسير إلى هذه الحالة من حالته الحالية.",
    en: "The payroll run cannot move to that status from its current one.",
    ur: "تنخواہ کا رن اپنی موجودہ حیثیت سے اس حیثیت میں نہیں جا سکتا۔",
  },
  PROJECT_OS_PMC_ACTIVITY_NOT_FOUND: {
    ar: "نشاط الفحص غير موجود.",
    en: "The inspection activity was not found.",
    ur: "معائنے کی سرگرمی نہیں ملی۔",
  },
  PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL: {
    ar: "النشاط ليس من نموذج هذه الوحدة.",
    en: "The activity is not part of this unit's model.",
    ur: "یہ سرگرمی اس یونٹ کے ماڈل کا حصہ نہیں ہے۔",
  },
  PROJECT_OS_PMC_IMPORT_FILE_CHANGED: {
    ar: "تغيّر الملف منذ المعاينة؛ أعد رفعه ومعاينته.",
    en: "The file changed since the preview; upload and preview it again.",
    ur: "پیش نظارہ کے بعد فائل بدل گئی ہے؛ اسے دوبارہ اپ لوڈ کرکے پیش نظارہ دیکھیں۔",
  },
  PROJECT_OS_PMC_INSPECTION_ALREADY_ANSWERED: {
    ar: "طلب الفحص أُجيب عنه سابقًا.",
    en: "The inspection request has already been answered.",
    ur: "معائنے کی درخواست کا جواب پہلے ہی دیا جا چکا ہے۔",
  },
  PROJECT_OS_PMC_INSPECTION_CODE_DUPLICATE: {
    ar: "رمز طلب الفحص مستعمل.",
    en: "The inspection request code is already used.",
    ur: "معائنے کی درخواست کا یہ کوڈ پہلے ہی استعمال ہو چکا ہے۔",
  },
  PROJECT_OS_PMC_INSPECTION_NOT_AT_RESULT_STEP: {
    ar: "طلب الفحص ليس في خطوة النتيجة.",
    en: "The inspection request is not at the result step.",
    ur: "معائنے کی درخواست نتیجے کے مرحلے پر نہیں ہے۔",
  },
  PROJECT_OS_PMC_INSPECTION_NOT_FOUND: {
    ar: "طلب الفحص غير موجود.",
    en: "The inspection request was not found.",
    ur: "معائنے کی درخواست نہیں ملی۔",
  },
  PROJECT_OS_PMC_INSPECTION_STEP_NOT_ACTIVE: {
    ar: "خطوة طلب الفحص غير فعّالة.",
    en: "The inspection request step is not active.",
    ur: "معائنے کی درخواست کا مرحلہ فعال نہیں ہے۔",
  },
  PROJECT_OS_PMC_INSPECTION_UNITS_REQUIRED: {
    ar: "اختر وحدة واحدة على الأقل لطلب الفحص.",
    en: "Select at least one unit for the inspection request.",
    ur: "معائنے کی درخواست کے لیے کم از کم ایک یونٹ منتخب کریں۔",
  },
  PROJECT_OS_PMC_PLAN_DIMENSIONS_INVALID: {
    ar: "أبعاد صورة المخطط غير صالحة.",
    en: "The site plan image dimensions are invalid.",
    ur: "سائٹ پلان کی تصویر کے طول و عرض درست نہیں ہیں۔",
  },
  PROJECT_OS_PMC_PLAN_FILE_INVALID: {
    ar: "ملف المخطط غير صالح.",
    en: "The site plan file is invalid.",
    ur: "سائٹ پلان کی فائل درست نہیں ہے۔",
  },
  PROJECT_OS_PMC_PLAN_FORMAT_UNSUPPORTED: {
    ar: "صيغة المخطط غير مدعومة.",
    en: "The site plan format is not supported.",
    ur: "سائٹ پلان کا فارمیٹ معاون نہیں ہے۔",
  },
  PROJECT_OS_PMC_SCREEN_UNKNOWN: {
    ar: "شاشة PMC غير معروفة.",
    en: "Unknown PMC screen.",
    ur: "پی ایم سی کی نامعلوم اسکرین۔",
  },
  PROJECT_OS_PMC_STATUS_CODE_DUPLICATE: {
    ar: "رمز الحالة مستعمل.",
    en: "The status code is already used.",
    ur: "حیثیت کا یہ کوڈ پہلے ہی استعمال ہو چکا ہے۔",
  },
  PROJECT_OS_PMC_STATUS_FACTORS_INVALID: {
    ar: "معاملات الحالات غير صالحة: يجب ألا تتناقص بتقدّم الحالة وأن تكون بين 0 و1.",
    en: "The status factors are invalid: they must not decrease as the status advances and must be between 0 and 1.",
    ur: "حیثیت کے عوامل درست نہیں: حیثیت آگے بڑھنے کے ساتھ کم نہیں ہو سکتے اور 0 اور 1 کے درمیان ہونے چاہئیں۔",
  },
  PROJECT_OS_PMC_UNIT_NOT_FOUND: {
    ar: "الوحدة غير موجودة.",
    en: "The unit was not found.",
    ur: "یونٹ نہیں ملا۔",
  },
  PROJECT_OS_PMC_VERIFICATION_STATUS_INACTIVE: {
    ar: "حالة التحقق غير فعّالة.",
    en: "The verification status is not active.",
    ur: "تصدیق کی حیثیت فعال نہیں ہے۔",
  },
  PROJECT_OS_PMC_VERIFICATION_STATUS_NOT_FOUND: {
    ar: "حالة التحقق غير موجودة.",
    en: "The verification status was not found.",
    ur: "تصدیق کی حیثیت نہیں ملی۔",
  },
  PROJECT_OS_REORDER_LEVEL_INVALID: {
    ar: "حد إعادة الطلب يجب أن يكون أكبر من صفر.",
    en: "The reorder level must be above zero.",
    ur: "دوبارہ آرڈر کی سطح صفر سے زیادہ ہونی چاہیے۔",
  },
  PROJECT_OS_SALARY_STRUCTURE_NOT_FOUND: {
    ar: "هيكل الراتب غير موجود.",
    en: "The salary structure was not found.",
    ur: "تنخواہ کا ڈھانچہ نہیں ملا۔",
  },
  PROJECT_OS_SCHEDULE_FORMAT_INVALID: {
    ar: "صيغة ملف الجدول غير مدعومة.",
    en: "The schedule file format is not supported.",
    ur: "شیڈول فائل کا فارمیٹ معاون نہیں ہے۔",
  },
  PROJECT_OS_SUBCONTRACT_CODE_EXISTS: {
    ar: "رمز عقد المقاول من الباطن مستعمل.",
    en: "The subcontract code is already used.",
    ur: "ذیلی ٹھیکے کا یہ کوڈ پہلے ہی استعمال ہو چکا ہے۔",
  },
  PROJECT_OS_SUBCONTRACT_NOT_FOUND: {
    ar: "عقد المقاول من الباطن غير موجود.",
    en: "The subcontract was not found.",
    ur: "ذیلی ٹھیکہ نہیں ملا۔",
  },
  PROJECT_OS_TIME_ENTRY_NOT_FOUND: {
    ar: "إدخال الوقت غير موجود.",
    en: "The time entry was not found.",
    ur: "کام کے گھنٹوں کا اندراج نہیں ملا۔",
  },
  PROJECT_OS_WBS_NOT_FOUND: {
    ar: "بند العمل غير موجود في هذا المشروع.",
    en: "The work item was not found in this project.",
    ur: "یہ کام کا آئٹم اس پروجیکٹ میں نہیں ملا۔",
  },
  PROJECT_OS_GRN_WAREHOUSE_REQUIRED: {
    ar: "اختر المستودع الذي يدخله هذا الاستلام، أو سجّله «توريدًا مباشرًا للموقع» إن لم يمرّ بمستودع.",
    en: "Choose the warehouse this receipt goes into, or record it as a direct delivery to site if it never passes through a warehouse.",
    ur: "وہ گودام منتخب کریں جس میں یہ وصولی جائے گی، یا اگر یہ کبھی گودام سے نہیں گزرتی تو اسے براہِ راست سائٹ پر سپلائی کے طور پر درج کریں۔",
  },
  PROJECT_OS_GRN_WAREHOUSE_NOT_ALLOWED: {
    ar: "التوريد المباشر للموقع لا يدخل مستودعًا؛ أزل المستودع أو غيّر نوع الاستلام إلى «يدخل المستودع».",
    en: "A direct delivery to site does not enter a warehouse; remove the warehouse or change the receipt to \"into the warehouse\".",
    ur: "براہِ راست سائٹ پر سپلائی گودام میں داخل نہیں ہوتی؛ گودام ہٹائیں، یا وصولی کو “گودام میں” میں تبدیل کریں۔",
  },
  PROJECT_OS_INVENTORY_UNIT_COST_INVALID: {
    ar: "تكلفة الوحدة يجب أن تكون موجبة، ولا تُدخَل مع حركة تُخرج مخزونًا (الإخراج يُقيَّم بالمتوسط المرجّح).",
    en: "The unit cost must be positive, and is not entered with a movement that takes stock out (outgoing stock is valued at the weighted average).",
    ur: "اکائی کی لاگت مثبت ہونی چاہیے، اور اسے ایسی نقل و حرکت کے ساتھ درج نہیں کیا جاتا جو اسٹاک نکالتی ہو (باہر جانے والا اسٹاک اوسط قیمت پر لگایا جاتا ہے)۔",
  },
  PROJECT_OS_MATERIAL_ISSUE_COST_REQUIRED: {
    ar: "هذا المخزون بلا سعر مسجَّل، فلا يوجد متوسط يُصرف به. أدخل تكلفة الوحدة لهذا الصرف.",
    en: "This stock has no recorded price, so there is no average to issue it at. Enter the unit cost for this issue.",
    ur: "اس اسٹاک کی کوئی قیمت درج نہیں، اس لیے اس کا اوسط نہیں ہے جس پر اسے جاری کیا جائے۔ اس اجرا کے لیے اکائی کی لاگت درج کریں۔",
  },
  PROJECT_OS_PAYROLL_AUTO_ALREADY_ALLOCATED: {
    ar: "تكلفة هذا الراتب موزَّعة على المشاريع بالفعل. لتعديل حصة استعمل «تعديل الحصة» مع ذكر السبب.",
    en: "This pay has already been allocated to projects. To change a share use \"adjust share\" and give the reason.",
    ur: "یہ تنخواہ پہلے ہی پروجیکٹوں میں مختص ہو چکی ہے۔ حصہ تبدیل کرنے کے لیے “حصہ ایڈجسٹ کریں” استعمال کریں اور وجہ لکھیں۔",
  },
  PROJECT_OS_PAYROLL_AUTO_NO_HOURS: {
    ar: "لا ساعات معتمدة لهذا الموظف في فترة المسير، فلا أساس للتوزيع بالساعات. اعتمد الساعات أولًا أو وزّع يدويًا.",
    en: "This employee has no approved hours in the payroll period, so there is nothing to share the cost by. Approve the hours first or allocate by hand.",
    ur: "اس ملازم کے تنخواہ کی مدت میں منظور شدہ گھنٹے نہیں ہیں، اس لیے لاگت بانٹنے کی بنیاد نہیں ہے۔ پہلے گھنٹے منظور کریں یا خود مختص کریں۔",
  },
  PROJECT_OS_PAYROLL_ADJUSTMENT_REASON_REQUIRED: {
    ar: "اكتب سبب تعديل الحصة (5 أحرف على الأقل). يُحفظ مع القيمة قبل التعديل وبعده.",
    en: "Give the reason for adjusting the share (at least 5 characters). It is kept with the value before and after.",
    ur: "حصے کی ایڈجسٹمنٹ کی وجہ لکھیں (کم از کم 5 حروف)۔ یہ پہلے اور بعد کی قدر کے ساتھ محفوظ ہوتی ہے۔",
  },
  PROJECT_OS_PAYROLL_ADJUSTMENT_NO_CHANGE: {
    ar: "القيمة الجديدة تساوي القيمة الحالية؛ لا شيء يُعدَّل.",
    en: "The new amount equals the current one; there is nothing to adjust.",
    ur: "نئی رقم موجودہ رقم کے برابر ہے؛ ایڈجسٹ کرنے کے لیے کچھ نہیں ہے۔",
  },
  PROJECT_OS_PAYROLL_ALLOCATION_NOT_FOUND: {
    ar: "حصة الراتب المطلوبة غير موجودة في هذه الشركة.",
    en: "The pay allocation was not found in this company.",
    ur: "تنخواہ کا یہ مختص اس کمپنی میں نہیں ملا۔",
  },
  PROJECT_OS_CONTRACT_SUPPLIER_REQUIRED: {
    ar: "العقد مع مورد: اختر المورد من سجل الموردين.",
    en: "A contract with a supplier needs the supplier chosen from the supplier register.",
    ur: "سپلائر کے ساتھ معاہدے کے لیے سپلائر کا انتخاب سپلائر رجسٹر سے کرنا ہوگا۔",
  },
  PROJECT_OS_CONTRACT_COUNTERPARTY_KIND_MISMATCH: {
    ar: "اخترتَ موردًا من السجل لكن نوع الطرف المقابل ليس «مورد».",
    en: "A supplier was chosen from the register but the counterparty type is not \"supplier\".",
    ur: "رجسٹر سے سپلائر منتخب کیا گیا ہے مگر فریق کی قسم “سپلائر” نہیں ہے۔",
  },
  PROJECT_OS_INVENTORY_REASON_REQUIRED: {
    ar: "اكتب سبب التحويل أو التسوية (3 أحرف على الأقل).",
    en: "Give the reason for the transfer or adjustment (at least 3 characters).",
    ur: "منتقلی یا ایڈجسٹمنٹ کی وجہ لکھیں (کم از کم 3 حروف)۔",
  },
  PROJECT_OS_PAYROLL_ALLOCATION_TIME_COSTED: {
    ar: "ساعات هذا الموظف في فترة المسير محتسبة تكلفتها فعلًا عبر إدخالات الوقت المعتمدة؛ تخصيص الراتب نفسه يعدّ التكلفة مرتين.",
    en: "This employee's hours in the payroll period were already costed through approved time entries; allocating the same pay would count the cost twice.",
    ur: "اس ملازم کے گھنٹے تنخواہ کی مدت میں منظور شدہ کام کے گھنٹوں کے ذریعے پہلے ہی لاگت میں شامل ہو چکے ہیں؛ اسی تنخواہ کو مختص کرنے سے لاگت دو بار شمار ہو جائے گی۔",
  },
  PROJECT_OS_TIME_ENTRY_PAYROLL_ALLOCATED: {
    ar: "راتب هذا الموظف في هذه الفترة مخصَّص للمشاريع من مسير الرواتب؛ اعتماد ساعاته يعدّ التكلفة مرتين.",
    en: "This employee's pay for the period is already allocated to projects from payroll; approving these hours would count the cost twice.",
    ur: "اس ملازم کی اس مدت کی تنخواہ پہلے ہی تنخواہ سے پروجیکٹوں میں مختص ہو چکی ہے؛ ان گھنٹوں کی منظوری سے لاگت دو بار شمار ہو جائے گی۔",
  },
  PROJECT_OS_SIGNUP_EMAIL_NOT_VERIFIED: {
    ar: "أكّد بريدك الإلكتروني أولًا: سجّل الدخول برمز يصلك على بريدك أو بحساب Google ثم أعد إنشاء مساحة العمل.",
    en: "Verify your email first: sign in with the code sent to your address or with Google, then create the workspace again.",
    ur: "پہلے ای میل کی تصدیق کریں: اپنے پتے پر بھیجے گئے کوڈ یا Google سے لاگ ان کریں، پھر ورک اسپیس دوبارہ بنائیں۔",
  },
  PROJECT_OS_PURCHASE_ORDER_SUPPLIER_REQUIRED: {
    ar: "اختر المورد من سجل الموردين أو اكتب اسم المورد.",
    en: "Choose the supplier from the supplier register or type the supplier's name.",
    ur: "سپلائر رجسٹر سے سپلائر منتخب کریں یا سپلائر کا نام لکھیں۔",
  },
  PROJECT_OS_RATE_LIMITED: {
    ar: "تجاوزت عدد الطلبات المسموح به في الدقيقة. انتظر قليلًا ثم أعد المحاولة.",
    en: "You have sent more requests than allowed per minute. Wait a moment and try again.",
    ur: "آپ نے فی منٹ کی اجازت سے زیادہ درخواستیں بھیجی ہیں۔ کچھ دیر انتظار کریں اور دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_SERVER_ERROR: {
    ar: "حدث خطأ في الخادم وسُجّل لدى فريق التشغيل. أعد المحاولة بعد قليل.",
    en: "A server error occurred and was recorded for the operations team. Try again shortly.",
    ur: "سرور پر خرابی پیش آئی اور آپریشنز ٹیم کے لیے ریکارڈ کی گئی۔ کچھ دیر بعد دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_REQUEST_TOO_LARGE: {
    ar: "حجم البيانات المرسلة أكبر من الحد المسموح به.",
    en: "The data sent is larger than allowed.",
    ur: "بھیجا گیا ڈیٹا اجازت شدہ حد سے بڑا ہے۔",
  },
  PROJECT_OS_NOT_FOUND: {
    ar: "العنوان المطلوب غير موجود.",
    en: "The requested address does not exist.",
    ur: "درخواست کردہ پتا موجود نہیں ہے۔",
  },
  PROJECT_OS_REQUEST_FAILED: {
    ar: "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة.",
    en: "We could not complete the request. Check the details and try again.",
    ur: "ہم درخواست مکمل نہیں کر سکے۔ تفصیلات دیکھ کر دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_DESIGN_DUPLICATE: {
    ar: "الرقم المدخل مستعمل من قبل في هذا المشروع (رقم مخطط أو مراجعة أو إحالة أو ملاحظة أو تقديم).",
    en: "That number is already used in this project (drawing, revision, transmittal, comment or submittal).",
    ur: "یہ نمبر اس پروجیکٹ میں پہلے ہی استعمال ہو چکا ہے (ڈرائنگ، ریویژن، ترسیلہ، تبصرہ یا جمع شدہ دستاویز)۔",
  },
  PROJECT_OS_DESIGN_DRAWING_NOT_FOUND: {
    ar: "المخطط المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected drawing is not available in the current project and workspace.",
    ur: "منتخب کردہ ڈرائنگ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_REVISION_NOT_FOUND: {
    ar: "مراجعة المخطط المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected drawing revision is not available in the current project and workspace.",
    ur: "منتخب کردہ ڈرائنگ ریویژن موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_DRAWING_CANCELLED: {
    ar: "المخطط ملغى؛ لا تُجرى عليه عمليات جديدة.",
    en: "The drawing is cancelled; no new operations are allowed on it.",
    ur: "ڈرائنگ منسوخ ہو چکی ہے؛ اس پر کوئی نیا کام نہیں ہو سکتا۔",
  },
  PROJECT_OS_DESIGN_DRAWING_APPROVED: {
    ar: "المخطط معتمد للتنفيذ؛ أصدر مراجعة جديدة قبل إضافة ملاحظات عليه.",
    en: "The drawing is approved for construction; issue a new revision before adding comments to it.",
    ur: "ڈرائنگ تعمیر کے لیے منظور ہو چکی ہے؛ اس پر تبصرے شامل کرنے سے پہلے نیا ریویژن جاری کریں۔",
  },
  PROJECT_OS_DESIGN_APPROVAL_STATE_INVALID: {
    ar: "لا يُعتمد المخطط إلا وهو قيد المراجعة (أي بعد إرساله في إحالة).",
    en: "A drawing can be approved only while it is under review (after it has been sent in a transmittal).",
    ur: "ڈرائنگ صرف اس وقت منظور ہو سکتی ہے جب وہ زیرِ جائزہ ہو (ترسیلہ میں بھیجے جانے کے بعد)۔",
  },
  PROJECT_OS_DESIGN_OPEN_COMMENTS: {
    ar: "لا يُعتمد المخطط وفيه ملاحظات مراجعة لم تُغلق على مراجعته الحالية.",
    en: "A drawing cannot be approved while review comments on its current revision are not closed.",
    ur: "جب تک اس کے موجودہ ریویژن پر جائزے کے تبصرے بند نہ ہوں، ڈرائنگ منظور نہیں ہو سکتی۔",
  },
  PROJECT_OS_DESIGN_SELF_APPROVAL: {
    ar: "من أصدر المراجعة لا يعتمدها؛ يلزم شخص آخر يملك صلاحية الاعتماد.",
    en: "Whoever issued the revision cannot approve it; another person with approval authority is needed.",
    ur: "جس نے ریویژن جاری کیا وہ اسے منظور نہیں کر سکتا؛ منظوری کا اختیار رکھنے والا کوئی اور شخص درکار ہے۔",
  },
  PROJECT_OS_DESIGN_TRANSMITTAL_NOT_FOUND: {
    ar: "الإحالة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected transmittal is not available in the current project and workspace.",
    ur: "منتخب کردہ ترسیلہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_TRANSMITTAL_EMPTY: {
    ar: "اختر مخططًا واحدًا على الأقل لتضمينه في الإحالة.",
    en: "Select at least one drawing revision to include in the transmittal.",
    ur: "ترسیلہ میں شامل کرنے کے لیے کم از کم ایک ڈرائنگ ریویژن منتخب کریں۔",
  },
  PROJECT_OS_DESIGN_TRANSMITTAL_TRANSITION_INVALID: {
    ar: "انتقال حالة الإحالة غير مسموح من حالتها الحالية.",
    en: "That transmittal-status transition is not allowed from its current status.",
    ur: "ترسیلہ کی یہ حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_COMMENT_NOT_FOUND: {
    ar: "ملاحظة المراجعة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected review comment is not available in the current project and workspace.",
    ur: "منتخب کردہ جائزے کا تبصرہ موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_COMMENT_TRANSITION_INVALID: {
    ar: "انتقال حالة الملاحظة غير مسموح من حالتها الحالية.",
    en: "That comment-status transition is not allowed from its current status.",
    ur: "تبصرے کی یہ حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_COMMENT_RESPONSE_REQUIRED: {
    ar: "اكتب ردًّا على الملاحظة قبل تسجيله.",
    en: "Write a response to the comment before recording it.",
    ur: "ریکارڈ کرنے سے پہلے تبصرے کا جواب لکھیں۔",
  },
  PROJECT_OS_DESIGN_SELF_CLOSE: {
    ar: "من ردّ على الملاحظة لا يغلقها؛ يلزم شخص آخر يملك صلاحية الاعتماد.",
    en: "Whoever answered a comment cannot close it; another person with approval authority is needed.",
    ur: "جس نے تبصرے کا جواب دیا ہو وہ اسے بند نہیں کر سکتا؛ منظوری کا اختیار رکھنے والا کوئی اور شخص درکار ہے۔",
  },
  PROJECT_OS_DESIGN_SUBMITTAL_NOT_FOUND: {
    ar: "التقديم المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected submittal is not available in the current project and workspace.",
    ur: "منتخب کردہ جمع شدہ دستاویز موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_SUBMITTAL_TRANSITION_INVALID: {
    ar: "انتقال حالة التقديم غير مسموح من حالته الحالية.",
    en: "That submittal-status transition is not allowed from its current status.",
    ur: "جمع شدہ دستاویز کی یہ حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_DESIGN_REPLY_CODE_REQUIRED: {
    ar: "اختر رمز رد الاستشاري (A أو B أو C أو D).",
    en: "Choose the consultant's reply code (A, B, C or D).",
    ur: "مشیر کا جواب کا کوڈ منتخب کریں (A، B، C یا D)۔",
  },
  PROJECT_OS_DESIGN_SELF_REPLY: {
    ar: "من أرسل التقديم لا يسجّل رد الاستشاري عليه؛ يلزم شخص آخر يملك صلاحية الاعتماد.",
    en: "Whoever sent the submittal cannot record the consultant's reply to it; another person with approval authority is needed.",
    ur: "جس نے جمع شدہ دستاویز بھیجی ہو وہ مشیر کا جواب درج نہیں کر سکتا؛ منظوری کا اختیار رکھنے والا کوئی اور شخص درکار ہے۔",
  },
  PROJECT_OS_DESIGN_RESUBMISSION_INVALID: {
    ar: "لا يُعاد تقديم إلا ما ردّ عليه الاستشاري بالرمز C أو D.",
    en: "Only a submittal the consultant answered with C or D can be resubmitted.",
    ur: "صرف وہ جمع شدہ دستاویز دوبارہ جمع ہو سکتی ہے جس کا مشیر نے C یا D سے جواب دیا ہو۔",
  },
  PROJECT_OS_TENDER_DUPLICATE: {
    ar: "الرمز المدخل مستعمل من قبل في هذا المشروع (حزمة مناقصة أو عقد أو التزام).",
    en: "That code is already used in this project (tender package, contract or commitment).",
    ur: "یہ کوڈ اس پروجیکٹ میں پہلے ہی استعمال ہو چکا ہے (ٹینڈر پیکیج، معاہدہ یا وعدہ)۔",
  },
  PROJECT_OS_TENDER_NOT_FOUND: {
    ar: "حزمة المناقصة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected tender package is not available in the current project and workspace.",
    ur: "منتخب کردہ ٹینڈر پیکیج موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_TENDER_SUPPLIER_NOT_FOUND: {
    ar: "المورد المحدد غير موجود في سجل الموردين أو غير نشط.",
    en: "The selected supplier is not in the supplier register or is not active.",
    ur: "منتخب کردہ سپلائر سپلائر رجسٹر میں نہیں ہے یا فعال نہیں ہے۔",
  },
  PROJECT_OS_TENDER_INVITATION_CLOSED: {
    ar: "لا تُضاف دعوات بعد إغلاق باب العروض أو الترسية أو الإلغاء.",
    en: "Invitations cannot be added once bidding is closed, awarded or cancelled.",
    ur: "بولی بند، ٹھیکہ دیے گئے یا منسوخ ہونے کے بعد دعوت نامے شامل نہیں کیے جا سکتے۔",
  },
  PROJECT_OS_TENDER_TRANSITION_INVALID: {
    ar: "انتقال حالة المناقصة غير مسموح من حالتها الحالية.",
    en: "That tender-status transition is not allowed from its current status.",
    ur: "ٹینڈر کی یہ حیثیت کی تبدیلی اپنی موجودہ حیثیت سے اجازت یافتہ نہیں ہے۔",
  },
  PROJECT_OS_TENDER_NO_INVITEES: {
    ar: "ادعُ موردًا واحدًا على الأقل قبل فتح باب العروض.",
    en: "Invite at least one supplier before opening the tender.",
    ur: "ٹینڈر کھولنے سے پہلے کم از کم ایک سپلائر کو دعوت دیں۔",
  },
  PROJECT_OS_TENDER_NOT_OPEN: {
    ar: "باب العروض غير مفتوح؛ لا تُدخل العروض ولا تُعدَّل ولا تُسحب إلا والمناقصة مفتوحة.",
    en: "Bidding is not open; bids can be entered, revised or withdrawn only while the tender is open.",
    ur: "بولی کھلی نہیں ہے؛ بولیاں صرف اس وقت درج، ترمیم یا واپس لی جا سکتی ہیں جب ٹینڈر کھلا ہو۔",
  },
  PROJECT_OS_TENDER_NOT_CLOSED: {
    ar: "هذه العملية لا تتم إلا بعد إغلاق باب العروض وقبل الترسية.",
    en: "This operation is possible only after bidding is closed and before the award.",
    ur: "یہ کارروائی صرف اس وقت ممکن ہے جب بولی بند ہو چکی ہو اور ٹھیکہ دینے سے پہلے کا وقت ہو۔",
  },
  PROJECT_OS_TENDER_NOT_INVITED: {
    ar: "هذا المورد غير مدعو إلى هذه المناقصة.",
    en: "This supplier was not invited to this tender.",
    ur: "اس سپلائر کو اس ٹینڈر کی دعوت نہیں دی گئی تھی۔",
  },
  PROJECT_OS_TENDER_BID_EXISTS: {
    ar: "لهذا المورد عرض مسجل في هذه المناقصة؛ عدّله بدل إدخال عرض ثانٍ.",
    en: "This supplier already has a bid in this tender; revise it instead of entering a second one.",
    ur: "اس سپلائر کی اس ٹینڈر میں پہلے ہی ایک بولی ہے؛ دوسری بولی درج کرنے کے بجائے اسے ترمیم کریں۔",
  },
  PROJECT_OS_TENDER_BID_NOT_FOUND: {
    ar: "العرض المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected bid is not available in the current project and workspace.",
    ur: "منتخب کردہ بولی موجودہ پروجیکٹ اور ورک اسپیس میں دستیاب نہیں ہے۔",
  },
  PROJECT_OS_TENDER_BID_STATE_INVALID: {
    ar: "حالة العرض لا تسمح بهذه العملية (مسحوب أو مستبعد).",
    en: "The bid's status does not allow this operation (withdrawn or disqualified).",
    ur: "بولی کی حیثیت اس کارروائی کی اجازت نہیں دیتی (واپس لی گئی یا نااہل قرار دی گئی)۔",
  },
  PROJECT_OS_TENDER_REASON_REQUIRED: {
    ar: "اكتب سبب الاستبعاد.",
    en: "Write the reason for the disqualification.",
    ur: "نااہلی کی وجہ لکھیں۔",
  },
  PROJECT_OS_TENDER_ADJUSTMENT_SIGN: {
    ar: "إشارة المبلغ لا تناسب نوع التسوية: الخصم سالب، وثغرة النطاق والاستثناء موجبان، والتصحيح بأي إشارة.",
    en: "The amount's sign does not fit the adjustment kind: a discount is negative, a scope gap or exclusion is positive, a correction may be either.",
    ur: "رقم کا نشان ایڈجسٹمنٹ کی قسم سے مطابقت نہیں رکھتا: رعایت منفی ہوتی ہے، جبکہ دائرہ کار کی کمی یا اخراج مثبت ہوتا ہے، اور اصلاح دونوں میں سے کچھ بھی ہو سکتی ہے۔",
  },
  PROJECT_OS_TENDER_ADJUSTMENT_NOT_FOUND: {
    ar: "بند التسوية المحدد غير متاح.",
    en: "The selected adjustment is not available.",
    ur: "منتخب کردہ ایڈجسٹمنٹ دستیاب نہیں ہے۔",
  },
  PROJECT_OS_TENDER_BID_NOT_ELIGIBLE: {
    ar: "لا تُرسى المناقصة على عرض مسحوب أو مستبعد.",
    en: "A tender cannot be awarded to a withdrawn or disqualified bid.",
    ur: "ٹھیکہ واپس لی گئی یا نااہل قرار دی گئی بولی کو نہیں دیا جا سکتا۔",
  },
  PROJECT_OS_TENDER_SELF_AWARD: {
    ar: "من أدخل عروض هذه المناقصة لا يرسّيها؛ يلزم شخص آخر يملك صلاحية الترسية.",
    en: "Whoever entered this tender's bids cannot award it; another person with award authority is needed.",
    ur: "جس نے اس ٹینڈر کی بولیاں درج کی ہوں وہ اسے ٹھیکہ نہیں دے سکتا؛ ٹھیکہ دینے کا اختیار رکھنے والا کوئی اور شخص درکار ہے۔",
  },
  PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED: {
    ar: "بأقل من عرضين صالحين للمقارنة يلزم تسبيب كتابي للترسية (10 أحرف على الأقل).",
    en: "With fewer than two comparable bids a written justification (at least 10 characters) is required to award.",
    ur: "دو سے کم قابلِ موازنہ بولیوں کی صورت میں ٹھیکہ دینے کے لیے تحریری جواز (کم از کم 10 حروف) درکار ہے۔",
  },
  PROJECT_OS_CURRENCY_NOT_SAR: {
    ar: "في الإصدار الأول تُسجَّل كل المبالغ بالريال السعودي (SAR) وحده. اختر SAR.",
    en: "In this first version every amount is recorded in the Saudi riyal (SAR) only. Choose SAR.",
    ur: "اس پہلے ورژن میں ہر رقم صرف سعودی ریال (SAR) میں درج ہوتی ہے۔ SAR منتخب کریں۔",
  },
  PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN: {
    ar: "من أعدّ الدفعة لا يعتمدها. يعتمدها شخص آخر يحمل صلاحية الاعتماد.",
    en: "The person who prepared a payment cannot approve it. Another person with approval permission must approve it.",
    ur: "جس شخص نے ادائیگی تیار کی ہو وہ اسے منظور نہیں کر سکتا۔ منظوری کی اجازت رکھنے والا کوئی اور شخص اسے منظور کرے۔",
  },
  PROJECT_OS_TENDER_CURRENCY_NOT_SAR: {
    ar: "عروض المناقصات وحزمها بالريال السعودي (SAR) وحده في الإصدار الأول. اختر SAR.",
    en: "Tender packages and bids are in the Saudi riyal (SAR) only in this first version. Choose SAR.",
    ur: "اس پہلے ورژن میں ٹینڈر پیکیج اور بولیاں صرف سعودی ریال (SAR) میں ہیں۔ SAR منتخب کریں۔",
  },
  PROJECT_OS_VISION_NOT_AVAILABLE: {
    ar: "قراءة المخطط بالذكاء الاصطناعي غير مفعّلة في هذه البيئة.",
    en: "Drawing reading with AI is not enabled in this environment.",
    ur: "اس ماحول میں AI سے ڈرائنگ پڑھنا فعال نہیں ہے۔",
  },
  PROJECT_OS_VISION_IMAGE_INVALID: {
    ar: "الصورة يجب أن تكون ملف PNG أو JPEG صالحًا بترميز base64.",
    en: "The image must be a valid PNG or JPEG file encoded as base64.",
    ur: "تصویر base64 میں انکوڈ شدہ درست PNG یا JPEG فائل ہونی چاہیے۔",
  },
  PROJECT_OS_VISION_IMAGE_TOO_LARGE: {
    ar: "حجم الصورة يتجاوز 3 ميجابايت. اقتطع المخطط أو اضغطه ثم أعد المحاولة.",
    en: "The image is larger than 3 MB. Crop or compress the drawing and try again.",
    ur: "تصویر 3 MB سے بڑی ہے۔ ڈرائنگ کو کاٹیں یا دبائیں اور دوبارہ کوشش کریں۔",
  },
  PROJECT_OS_VISION_OUTPUT_INVALID: {
    ar: "تعذّر قراءة اقتراحات النموذج، ولم يُحفظ شيء.",
    en: "The suggestions could not be read. Nothing was saved.",
    ur: "تجاویز پڑھی نہیں جا سکیں۔ کچھ محفوظ نہیں ہوا۔",
  },
  PROJECT_OS_VISION_PROVIDER_FAILED: {
    ar: "فشل طلب قراءة المخطط لدى مزود الخدمة، ولم يُحفظ شيء.",
    en: "The drawing reading request failed at the provider. Nothing was saved.",
    ur: "فراہم کنندہ کے پاس ڈرائنگ پڑھنے کی درخواست ناکام رہی۔ کچھ محفوظ نہیں ہوا۔",
  },
  PROJECT_OS_MASTER_PLAN_CALIBRATION_INVALID: {
    ar: "أدخل عرض منطقة الخطة وطولها بالأمتار معًا، وكلاهما رقم موجب لا يتجاوز 100000.",
    en: "Enter the plan area's width and length in metres together; both must be positive and at most 100000.",
    ur: "پلان کے رقبے کی چوڑائی اور لمبائی میٹر میں ایک ساتھ درج کریں؛ دونوں مثبت اور زیادہ سے زیادہ 100000 ہونی چاہئیں۔",
  },
  PROJECT_OS_MASTER_PLAN_ROTATION_INVALID: {
    ar: "زاوية التدوير غير صالحة.",
    en: "The rotation angle is not valid.",
    ur: "گردش کا زاویہ درست نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_NOTHING_TO_CHANGE: {
    ar: "لم تُحدَّد أي قيمة للتعديل.",
    en: "Nothing was given to change.",
    ur: "تبدیل کرنے کے لیے کچھ نہیں دیا گیا۔",
  },
  PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_FOUND: {
    ar: "العرض المحفوظ المحدد غير متاح لك.",
    en: "The selected saved view is not available to you.",
    ur: "منتخب کردہ محفوظ منظر آپ کے لیے دستیاب نہیں ہے۔",
  },
  PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_OWNER: {
    ar: "وحده من حفظ العرض يقرر مشاركته.",
    en: "Only the person who saved the view decides whether it is shared.",
    ur: "صرف وہی شخص فیصلہ کرتا ہے کہ محفوظ منظر کو شیئر کیا جائے جس نے اسے محفوظ کیا ہو۔",
  },
} as const satisfies Record<string, BilingualMessage>;

export type ProjectErrorCode = keyof typeof projectErrorMessages;

export function getProjectError(codeOrMessage: string): { code: ProjectErrorCode; messages: BilingualMessage } {
  if (codeOrMessage in projectErrorMessages) {
    const code = codeOrMessage as ProjectErrorCode;
    return { code, messages: projectErrorMessages[code] };
  }

  if (codeOrMessage === "Please login (10001)") {
    return { code: "PROJECT_OS_AUTH_REQUIRED", messages: projectErrorMessages.PROJECT_OS_AUTH_REQUIRED };
  }
  if (codeOrMessage.includes("not licensed")) {
    return { code: "PROJECT_OS_PRODUCT_NOT_ENTITLED", messages: projectErrorMessages.PROJECT_OS_PRODUCT_NOT_ENTITLED };
  }
  if (codeOrMessage.includes("membership") || codeOrMessage.includes("Tenant scope")) {
    return { code: "PROJECT_OS_TENANT_ACCESS_DENIED", messages: projectErrorMessages.PROJECT_OS_TENANT_ACCESS_DENIED };
  }
  if (codeOrMessage.includes("permission") || codeOrMessage.includes("Role scope")) {
    return { code: "PROJECT_OS_PERMISSION_DENIED", messages: projectErrorMessages.PROJECT_OS_PERMISSION_DENIED };
  }

  return { code: "PROJECT_OS_REQUEST_FAILED", messages: projectErrorMessages.PROJECT_OS_REQUEST_FAILED };
}
