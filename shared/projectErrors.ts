export type BilingualMessage = {
  ar: string;
  en: string;
};

export const projectErrorMessages = {
  PROJECT_OS_AUTH_REQUIRED: {
    ar: "يلزم تسجيل الدخول لمتابعة هذه العملية.",
    en: "You must sign in to continue this operation.",
  },
  PROJECT_OS_TENANT_ACCESS_DENIED: {
    ar: "لا تملك وصولاً إلى مساحة العمل المطلوبة.",
    en: "You do not have access to the requested workspace.",
  },
  PROJECT_OS_PRODUCT_NOT_ENTITLED: {
    ar: "لا تتضمن حزمة مساحة العمل هذا المستوى التشغيلي.",
    en: "This workspace package does not include the requested operating level.",
  },
  PROJECT_OS_PERMISSION_DENIED: {
    ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.",
    en: "You do not have the required permission to complete this operation.",
  },
  PROJECT_OS_SERVICE_UNAVAILABLE: {
    ar: "الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل.",
    en: "The service is temporarily unavailable. Try again shortly.",
  },
  PROJECT_OS_TENANT_NOT_FOUND: {
    ar: "الشركة المطلوبة غير متاحة.",
    en: "The requested company is not available.",
  },
  PROJECT_OS_TENANT_OWNER_REQUIRED: {
    ar: "هذه العملية لمالك الشركة وحده.",
    en: "Only the company owner can do this.",
  },
  PROJECT_OS_DELETION_EXPORT_REQUIRED: {
    ar: "نزّل نسخة من بيانات الشركة أولًا؛ لا يُسمح بالحذف النهائي إلا بعد تصدير أُجري خلال الأيام السبعة الماضية.",
    en: "Download a copy of the company's data first: permanent deletion is allowed only after an export made in the last seven days.",
  },
  PROJECT_OS_DELETION_CONFIRMATION_INVALID: {
    ar: "رمز تأكيد الحذف غير صالح لهذه الشركة أو لهذا المستخدم. اطلب الحذف من جديد.",
    en: "The deletion confirmation code is not valid for this company or this person. Request the deletion again.",
  },
  PROJECT_OS_DELETION_CONFIRMATION_EXPIRED: {
    ar: "انتهت مهلة رمز تأكيد الحذف (15 دقيقة). اطلب الحذف من جديد.",
    en: "The deletion confirmation code has expired (15 minutes). Request the deletion again.",
  },
  PROJECT_OS_DELETION_IN_PROGRESS: {
    ar: "حذف هذه الشركة جارٍ الآن في عملية أخرى. انتظر خمس دقائق ثم أعد المحاولة إن لم يكتمل.",
    en: "Deletion of this company is already running in another operation. Wait five minutes and try again if it has not finished.",
  },
  PROJECT_OS_DELETION_NAME_MISMATCH: {
    ar: "الاسم المكتوب لا يطابق اسم الشركة تمامًا. لم يُحذف شيء.",
    en: "The name you typed does not exactly match the company name. Nothing was deleted.",
  },
  PROJECT_OS_TENANT_SCHEMA_UNCLASSIFIED: {
    ar: "تعذّر التصدير أو الحذف: في قاعدة البيانات جدول لم يُصنَّف بعد ضمن بيانات الشركة. لم يُغيَّر شيء؛ أبلغ الدعم.",
    en: "The export or deletion cannot run: the database has a table that is not yet classified as company data. Nothing was changed; contact support.",
  },
  PROJECT_OS_PROJECT_NOT_FOUND: {
    ar: "المشروع المطلوب غير متاح ضمن مساحة العمل هذه.",
    en: "The requested project is not available in this workspace.",
  },
  PROJECT_OS_WBS_SCOPE_MISMATCH: {
    ar: "بند WBS المحدد لا يتبع للمشروع المطلوب.",
    en: "The selected WBS item does not belong to the requested project.",
  },
  PROJECT_OS_ACTIVITY_SCHEDULE_INVALID: {
    ar: "لا يمكن أن يسبق تاريخ نهاية النشاط تاريخ بدايته المخطط.",
    en: "An activity's planned finish date cannot be earlier than its planned start date.",
  },
  PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN: {
    ar: "لا يمكنك تعديل عضويتك أو امتيازاتك من خلال هذا المسار.",
    en: "You cannot change your own membership or privileges through this path.",
  },
  PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID: {
    ar: "انتقال حالة العضوية المطلوب غير مسموح.",
    en: "The requested membership status transition is not allowed.",
  },
  PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN: {
    ar: "لا يمكن تعطيل آخر مالك نشط للمؤسسة.",
    en: "The last active tenant owner cannot be deactivated.",
  },
  PROJECT_OS_INVALID_SCOPE: {
    ar: "حدد نطاقًا صالحًا للدور المطلوب إسناده.",
    en: "Select a valid scope for the role assignment.",
  },
  PROJECT_OS_USER_NOT_FOUND: {
    ar: "لا يمكن العثور على المستخدم المحدد.",
    en: "The selected user could not be found.",
  },
  PROJECT_OS_ROLE_NOT_FOUND: {
    ar: "الدور المحدد غير متاح ضمن هذه الشركة.",
    en: "The selected role is not available in this organization.",
  },
  PROJECT_OS_ROLE_CODE_EXISTS: {
    ar: "رمز الدور مستخدم بالفعل ضمن هذه الشركة.",
    en: "This role code is already in use in this organization.",
  },
  PROJECT_OS_INVALID_ROLE_PERMISSIONS: {
    ar: "يجب أن تنتمي جميع الصلاحيات المختارة إلى منتج الدور المحدد وأن تكون موجودة في الكتالوج.",
    en: "Every selected permission must exist in the catalog and belong to the selected role product.",
  },
  PROJECT_OS_SYSTEM_ROLE_IMMUTABLE: {
    ar: "لا يمكن تعديل دور يديره النظام.",
    en: "A system-managed role cannot be modified.",
  },
  PROJECT_OS_MEMBER_NOT_FOUND: {
    ar: "العضوية المحددة غير متاحة ضمن هذه الشركة.",
    en: "The selected membership is not available in this organization.",
  },
  PROJECT_OS_ROLE_ASSIGNMENT_EXISTS: {
    ar: "الدور والنطاق المحددان مسندان بالفعل إلى هذه العضوية.",
    en: "This role and scope are already assigned to the selected membership.",
  },
  PROJECT_OS_TIME_ENTRY_INVALID: {
    ar: "ساعات العمل بين صفر و24 ساعة، ونسبة التقدم بين 0 و100.",
    en: "Hours worked must be above zero and at most 24, and progress between 0 and 100.",
  },
  PROJECT_OS_TIME_ENTRY_ASSIGNMENT_INVALID: {
    ar: "الإسناد غير متاح أو لا يغطي هذا اليوم.",
    en: "The assignment is not available or does not cover that day.",
  },
  PROJECT_OS_CLIENT_REQUEST_REUSED: {
    ar: "معرّف الطلب مستخدم لعملية أخرى. أعد المحاولة من البداية.",
    en: "That request identifier belongs to a different operation. Start the entry again.",
  },
  PROJECT_OS_CLIENT_REQUEST_IN_PROGRESS: {
    ar: "هذا الطلب قيد التنفيذ أو لم يُعرف مآله. تحقق من السجل قبل إعادة الإرسال.",
    en: "This request is still running, or its outcome is not known. Check the record before sending it again.",
  },
  PROJECT_OS_TEAM_ENTRIES_COUNT_INVALID: {
    ar: "أدخل ساعات موظف واحد على الأقل، وبحد أقصى 200 في المرة الواحدة.",
    en: "Enter the hours of at least one person, and no more than 200 at a time.",
  },
  PROJECT_OS_TEAM_ENTRY_DUPLICATE: {
    ar: "الإسناد نفسه مكرر في الورقة.",
    en: "The same assignment appears twice on the sheet.",
  },
  PROJECT_OS_INVOICE_NOT_FOUND: {
    ar: "الفاتورة المطلوبة غير متاحة ضمن هذا المشروع.",
    en: "The requested invoice is not available in this project.",
  },
  PROJECT_OS_INVOICE_TRANSITION_INVALID: {
    ar: "لا يمكن نقل الفاتورة إلى هذه الحالة من حالتها الحالية: المسودة تصدر أو تلغى، والصادرة تُسدَّد أو تلغى، والمسدَّدة لا تتغير.",
    en: "The invoice cannot move to that status from its current one: a draft is issued or voided, an issued invoice is paid or voided, a paid invoice does not change.",
  },
  PROJECT_OS_INVOICE_PAID_DATE_INVALID: {
    ar: "تاريخ السداد لا يسبق تاريخ الفاتورة ولا يكون في المستقبل البعيد.",
    en: "The payment date cannot be before the invoice date or far in the future.",
  },
  PROJECT_OS_LABOUR_SETTINGS_INVALID: {
    ar: "إعدادات التكلفة غير صالحة: نسب موجبة معقولة، ساعات اليوم بين 1 و24، ويوم عمل واحد على الأقل بلا تكرار.",
    en: "The cost settings are not valid: sensible positive rates, 1 to 24 hours a day, and at least one working day with no repeats.",
  },
  PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT: {
    ar: "لا يمكن جمع هذين الدورين المتعارضين للمستخدم نفسه ضمن نطاق متداخل.",
    en: "The same user cannot hold these conflicting roles in overlapping scopes.",
  },
  PROJECT_OS_EMPLOYEE_NOT_FOUND: {
    ar: "بطاقة الموظف المحددة غير متاحة ضمن مساحة العمل الحالية.",
    en: "The selected employee record is unavailable in the current workspace.",
  },
  PROJECT_OS_EMPLOYEE_NUMBER_EXISTS: {
    ar: "الرقم الوظيفي مستخدم بالفعل ضمن مساحة العمل هذه.",
    en: "This employee number is already in use in this workspace.",
  },
  PROJECT_OS_EMPLOYEE_LINKED_USER_INVALID: {
    ar: "يمكن ربط بطاقة الموظف بحساب عضو في مساحة العمل فقط.",
    en: "An employee record can only be linked to a workspace member account.",
  },
  PROJECT_OS_EMPLOYEE_LINKED_USER_EXISTS: {
    ar: "الحساب المحدد مرتبط بالفعل ببطاقة موظف ضمن مساحة العمل.",
    en: "The selected account is already linked to an employee record in this workspace.",
  },
  PROJECT_OS_EMPLOYEE_ALREADY_ARCHIVED: {
    ar: "بطاقة الموظف مؤرشفة بالفعل ولا يمكن إنهاء خدمتها مرة أخرى.",
    en: "This employee record is already archived and cannot be terminated again.",
  },
  PROJECT_OS_EMPLOYMENT_CONTRACT_NOT_FOUND: {
    ar: "عقد العمل المحدد غير متاح لهذه البطاقة ضمن مساحة العمل.",
    en: "The selected employment contract is unavailable for this employee in the workspace.",
  },
  PROJECT_OS_EMPLOYMENT_CONTRACT_DATES_INVALID: {
    ar: "لا يمكن أن يسبق تاريخ نهاية العقد أو نهاية التجربة تاريخ بداية العقد.",
    en: "A contract or probation end date cannot be earlier than the contract start date.",
  },
  PROJECT_OS_ROLE_ASSIGNMENT_NOT_FOUND: {
    ar: "إسناد الدور المحدد غير متاح ضمن هذه الشركة.",
    en: "The selected role assignment is not available in this organization.",
  },
  PROJECT_OS_MEMBER_ALREADY_EXISTS: {
    ar: "للمستخدم المحدد عضوية قائمة ضمن هذه الشركة.",
    en: "The selected user already has a membership in this organization.",
  },
  PROJECT_OS_INVITATION_ALREADY_PENDING: {
    ar: "توجد دعوة معلقة بالفعل لهذا البريد ضمن الشركة.",
    en: "A pending invitation already exists for this email in the organization.",
  },
  PROJECT_OS_INVITATION_INVALID_OR_EXPIRED: {
    ar: "رابط الدعوة غير صالح أو انتهت صلاحيته.",
    en: "The invitation link is invalid or has expired.",
  },
  PROJECT_OS_INVITATION_EMAIL_MISMATCH: {
    ar: "يجب تسجيل الدخول بالبريد الذي استلم الدعوة.",
    en: "Sign in with the email address that received this invitation.",
  },
  PROJECT_OS_PORTFOLIO_NOT_FOUND: {
    ar: "المحفظة المحددة غير متاحة ضمن هذه الشركة.",
    en: "The selected portfolio is not available in this organization.",
  },
  PROJECT_OS_PROGRAM_NOT_FOUND: {
    ar: "البرنامج المحدد غير متاح ضمن هذه الشركة.",
    en: "The selected program is not available in this organization.",
  },
  PROJECT_OS_PROGRAM_PORTFOLIO_MISMATCH: {
    ar: "المحفظة المحددة لا تتطابق مع محفظة البرنامج.",
    en: "The selected portfolio does not match the program's portfolio.",
  },
  PROJECT_OS_LIFECYCLE_TRANSITION_INVALID: {
    ar: "انتقال دورة حياة المشروع المحدد غير مسموح من مرحلته الحالية.",
    en: "The selected project lifecycle transition is not allowed from its current stage.",
  },
  PROJECT_OS_CONTRACT_NOT_FOUND: {
    ar: "العقد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected contract is not available in the current project and workspace.",
  },
  PROJECT_OS_CONTRACT_DATES_INVALID: {
    ar: "لا يمكن أن يسبق تاريخ انتهاء العقد تاريخ بدايته.",
    en: "A contract end date cannot be earlier than its start date.",
  },
  PROJECT_OS_DOCUMENT_NOT_FOUND: {
    ar: "المستند المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected document is not available in the current project and workspace.",
  },
  PROJECT_OS_DOCUMENT_CONTENT_INVALID: {
    ar: "محتوى الملف غير صالح أو يتجاوز حد الحجم المسموح.",
    en: "The file content is invalid or exceeds the permitted size limit.",
  },
  PROJECT_OS_DOCUMENT_WORKFLOW_TRANSITION_INVALID: {
    ar: "انتقال حالة المستند المحدد غير مسموح من حالته الحالية.",
    en: "The selected document-status transition is not allowed from its current status.",
  },
  PROJECT_OS_MASTER_PLAN_CODE_EXISTS: {
    ar: "رمز Master Plan مستخدم بالفعل ضمن هذا المشروع.",
    en: "This Master Plan code is already in use in this project.",
  },
  PROJECT_OS_MASTER_PLAN_NOT_FOUND: {
    ar: "Master Plan المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected Master Plan is not available in the current project and workspace.",
  },
  PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND: {
    ar: "إصدار Master Plan المحدد غير متاح ضمن المشروع الحالي.",
    en: "The selected Master Plan version is not available in the current project.",
  },
  PROJECT_OS_MASTER_PLAN_PARENT_NOT_FOUND: {
    ar: "الكيان المكاني الأب المحدد غير متاح ضمن إصدار Master Plan الحالي.",
    en: "The selected parent spatial entity is not available in the current Master Plan version.",
  },
  PROJECT_OS_MASTER_PLAN_PARENT_CYCLE: {
    ar: "لا يمكن أن يحتوي ملف الكيانات المكانية على دورة في علاقات الكيان الأب.",
    en: "The spatial-entity file cannot contain a cycle in parent-entity relationships.",
  },
  PROJECT_OS_MASTER_PLAN_GEOMETRY_INVALID: {
    ar: "حدود الكيان المكاني يجب أن تقع بالكامل داخل مخطط 100×100 وأن يكون له عرض وارتفاع موجبان.",
    en: "The spatial entity must fit inside the 100×100 plan and have positive width and height.",
  },
  PROJECT_OS_MASTER_PLAN_PROGRESS_INVALID: {
    ar: "يجب أن تكون نسبة تقدم الكيان المكاني بين 0 و100.",
    en: "A spatial entity progress percentage must be between 0 and 100.",
  },
  PROJECT_OS_MASTER_PLAN_SOURCE_INVALID: {
    ar: "ملف أصل Master Plan يجب أن يكون PNG أو JPG أو WEBP أو PDF وباسم ونوع ملف صالحين.",
    en: "The Master Plan source must be a PNG, JPG, WEBP, or PDF file with a valid file name and type.",
  },
  PROJECT_OS_MASTER_PLAN_MAPPING_VALIDATION_FAILED: {
    ar: "تعذر تطبيق ملف الربط لأن الأعمدة أو القيم لا تحقق قالب Master Plan.",
    en: "The mapping file could not be applied because its columns or values do not satisfy the Master Plan template.",
  },
  PROJECT_OS_MASTER_PLAN_SPATIAL_IMPORT_VALIDATION_FAILED: {
    ar: "تعذر إنشاء الكيانات من الملف لأن الأعمدة أو الهندسة أو القيم لا تحقق قالب الكيانات المكانية.",
    en: "Spatial entities could not be created because the file columns, geometry, or values do not satisfy the spatial-entity template.",
  },
  PROJECT_OS_MASTER_PLAN_ENTITY_CODE_EXISTS: {
    ar: "يوجد رمز كيان مكاني مستخدم بالفعل ضمن إصدار Master Plan المحدد.",
    en: "A spatial-entity code in the file already exists in the selected Master Plan version.",
  },
  PROJECT_OS_MASTER_PLAN_WBS_ACTIVITY_MISMATCH: {
    ar: "النشاط المحدد في ملف الكيان لا يتبع لعنصر WBS المحدد في الصف نفسه.",
    en: "The activity in the spatial-entity file does not belong to the WBS item selected in the same row.",
  },
  PROJECT_OS_MASTER_PLAN_ENTITY_NOT_FOUND: {
    ar: "لا يتطابق أحد رموز الوحدات في الملف مع كيان مكاني ضمن إصدار Master Plan المحدد.",
    en: "A unit code in the file does not match a spatial entity in the selected Master Plan version.",
  },
  PROJECT_OS_LICENSING_ADMIN_REQUIRED: {
    ar: "تتطلب إدارة التراخيص صلاحية مسؤول المنصة.",
    en: "Licensing management requires platform-administrator access.",
  },
  PROJECT_OS_COMMERCIAL_PLAN_NOT_FOUND: {
    ar: "الخطة التجارية المحددة غير متاحة أو غير نشطة.",
    en: "The selected commercial plan is unavailable or inactive.",
  },
  PROJECT_OS_LICENSE_NOT_FOUND: {
    ar: "الرخصة المحددة غير متاحة ضمن مساحة العمل هذه.",
    en: "The selected license is unavailable in this workspace.",
  },
  PROJECT_OS_LICENSE_TRANSITION_INVALID: {
    ar: "انتقال حالة الرخصة المحدد غير مسموح من حالتها الحالية.",
    en: "The selected license-status transition is not allowed from its current status.",
  },
  PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE: {
    ar: "لا تتضمن الرخصة النشطة الميزة المطلوبة.",
    en: "The active license does not include the required feature.",
  },
  PROJECT_OS_LICENSE_LIMIT_EXCEEDED: {
    ar: "تم بلوغ الحد المسموح لهذه الميزة في الرخصة النشطة.",
    en: "The active license limit for this feature has been reached.",
  },
  PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED: {
    ar: "تم بلوغ عدد المقاعد المسموح به في الرخصة النشطة.",
    en: "The active license seat limit has been reached.",
  },
  PROJECT_OS_SIGNUP_EMAIL_REQUIRED: {
    ar: "يتطلب إنشاء مساحة عمل ذاتية بريدًا موثقًا في جلسة الحساب الحالية.",
    en: "Self-service workspace creation requires an email address on the current authenticated account.",
  },
  PROJECT_OS_SIGNUP_RATE_LIMITED: {
    ar: "تم بلوغ الحد المؤقت لمحاولات إنشاء مساحات العمل. حاول لاحقًا.",
    en: "The temporary workspace-creation limit has been reached. Try again later.",
  },
  PROJECT_OS_WORKSPACE_SLUG_EXISTS: {
    ar: "الاسم المختصر لمساحة العمل مستخدم بالفعل. اختر اسمًا مختصرًا آخر.",
    en: "This workspace slug is already in use. Choose a different workspace slug.",
  },
  PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE: {
    ar: "تعذر إنشاء مساحة العمل الآن. لم تُنشأ أي بيانات. أعد المحاولة لاحقًا أو تواصل مع الدعم إذا استمر الخطأ.",
    en: "The workspace could not be created now. No data was created. Try again later or contact support if the error persists.",
  },
  PROJECT_OS_BILLING_SUBSCRIPTION_NOT_FOUND: {
    ar: "الاشتراك المحدد غير متاح ضمن مساحة العمل الحالية.",
    en: "The selected subscription is unavailable in the current workspace.",
  },
  PROJECT_OS_PAYMENT_CONFIRMATION_INVALID: {
    ar: "لا يمكن تأكيد سجل الدفع اليدوي المحدد في حالته الحالية.",
    en: "The selected manual payment record cannot be confirmed in its current state.",
  },
  PROJECT_OS_SUPPORT_TICKET_NOT_FOUND: {
    ar: "تذكرة الدعم المحددة غير متاحة ضمن مساحة العمل الحالية.",
    en: "The selected support ticket is unavailable in the current workspace.",
  },
  PROJECT_OS_SUPPORT_SOURCE_DOCUMENT_NOT_ALLOWED: {
    ar: "لا يمكن استخدام هذا المستند كمصدر للمعرفة؛ يجب أن يكون مستندًا معتمدًا ضمن مساحة العمل.",
    en: "This document cannot be used as a knowledge source; it must be an approved document in the workspace.",
  },
  PROJECT_OS_RFI_NOT_FOUND: {
    ar: "طلب المعلومات المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected RFI is not available in the current project and workspace.",
  },
  PROJECT_OS_RFI_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب المعلومات المحدد غير مسموح من حالته الحالية.",
    en: "The selected RFI-status transition is not allowed from its current status.",
  },
  PROJECT_OS_NCR_NOT_FOUND: {
    ar: "سجل عدم المطابقة المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected NCR is not available in the current project and workspace.",
  },
  PROJECT_OS_NCR_TRANSITION_INVALID: {
    ar: "انتقال حالة عدم المطابقة المحدد غير مسموح من حالته الحالية.",
    en: "The selected NCR-status transition is not allowed from its current status.",
  },
  PROJECT_OS_HSE_OBSERVATION_NOT_FOUND: {
    ar: "ملاحظة HSE المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected HSE observation is not available in the current project and workspace.",
  },
  PROJECT_OS_HSE_TRANSITION_INVALID: {
    ar: "انتقال حالة ملاحظة HSE المحدد غير مسموح من حالتها الحالية.",
    en: "The selected HSE-observation transition is not allowed from its current status.",
  },
  PROJECT_OS_FIELD_REPORT_NOT_FOUND: {
    ar: "التقرير الميداني المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected field report is not available in the current project and workspace.",
  },
  PROJECT_OS_FIELD_REPORT_TRANSITION_INVALID: {
    ar: "انتقال حالة التقرير الميداني المحدد غير مسموح من حالته الحالية.",
    en: "The selected field-report transition is not allowed from its current status.",
  },
  PROJECT_OS_FIELD_REPORT_WORKFORCE_INVALID: {
    ar: "عدد العاملين في التقرير الميداني يجب أن يكون عددًا صحيحًا بين صفر و100000.",
    en: "The field-report workforce count must be a whole number between 0 and 100000.",
  },
  PROJECT_OS_QUALITY_INSPECTION_NOT_FOUND: {
    ar: "فحص الجودة المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected quality inspection is not available in the current project and workspace.",
  },
  PROJECT_OS_QUALITY_INSPECTION_TRANSITION_INVALID: {
    ar: "انتقال حالة فحص الجودة المحدد غير مسموح من حالته الحالية.",
    en: "The selected quality-inspection transition is not allowed from its current status.",
  },
  PROJECT_OS_PURCHASE_ORDER_NOT_FOUND: {
    ar: "أمر الشراء المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected purchase order is not available in the current project and workspace.",
  },
  PROJECT_OS_PURCHASE_ORDER_TRANSITION_INVALID: {
    ar: "انتقال حالة أمر الشراء المحدد غير مسموح من حالته الحالية.",
    en: "The selected purchase-order transition is not allowed from its current status.",
  },
  PROJECT_OS_PURCHASE_ORDER_REFERENCE_INVALID: {
    ar: "العقد أو الالتزام المحدد لا يطابق الشركة والمشروع الحاليين.",
    en: "The selected contract or commitment does not belong to the current tenant and project.",
  },
  PROJECT_OS_CONTROL_LINK_REFERENCE_INVALID: {
    ar: "سجل المصدر أو الهدف المحدد لا يطابق الشركة والمشروع الحاليين.",
    en: "The selected source or target record does not belong to the current tenant and project.",
  },
  PROJECT_OS_CONTROL_LINK_SELF_REFERENCE: {
    ar: "لا يمكن ربط السجل بنفسه.",
    en: "A record cannot be linked to itself.",
  },
  PROJECT_OS_CONTROL_LINK_DUPLICATE: {
    ar: "الرابط المحدد موجود بالفعل ضمن المشروع.",
    en: "The selected record link already exists in this project.",
  },
  PROJECT_OS_CHANGE_REQUEST_NOT_FOUND: {
    ar: "طلب التغيير المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected change request is not available in the current project and workspace.",
  },
  PROJECT_OS_CHANGE_REQUEST_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب التغيير المحدد غير مسموح من حالته الحالية.",
    en: "The selected change-request transition is not allowed from its current status.",
  },
  PROJECT_OS_ISSUE_NOT_FOUND: {
    ar: "القضية المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected issue is not available in the current project and workspace.",
  },
  PROJECT_OS_ACTION_NOT_FOUND: {
    ar: "الإجراء المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected action is not available in the current project and workspace.",
  },
  PROJECT_OS_ESCALATION_TRANSITION_INVALID: {
    ar: "انتقال حالة التصعيد المحدد غير مسموح من حالته الحالية.",
    en: "The selected escalation transition is not allowed from its current status.",
  },
  PROJECT_OS_ESCALATION_NOT_ELIGIBLE: {
    ar: "لا يستوفي هذا السجل شروط التصعيد في حالته الحالية.",
    en: "This record does not meet the escalation conditions in its current state.",
  },
  PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN: {
    ar: "لا يمكن أن تتجاوز وحدات المورد المخصصة وحداته المخططة.",
    en: "Allocated resource units cannot exceed planned resource units.",
  },
  PROJECT_OS_RESOURCE_NOT_FOUND: {
    ar: "المورد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected resource is not available in the current project and workspace.",
  },
  PROJECT_OS_ASSIGNMENT_NOT_FOUND: {
    ar: "الإسناد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected assignment is not available in the current project and workspace.",
  },
  PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED: {
    ar: "يلزم اعتماد حضور الموظف بحالة حاضر في هذا اليوم قبل تسجيل ساعات العمل.",
    en: "Approved present attendance for this day is required before work hours can be recorded.",
  },
  PROJECT_OS_ATTENDANCE_DAY_EXISTS: {
    ar: "يوجد سجل حضور لهذا الموظف في التاريخ المحدد بالفعل.",
    en: "An attendance record already exists for this employee on the selected date.",
  },
  PROJECT_OS_ATTENDANCE_TRANSITION_INVALID: {
    ar: "انتقال حالة الحضور المطلوب غير مسموح من حالته الحالية.",
    en: "The requested attendance transition is not allowed from its current status.",
  },
  PROJECT_OS_TIME_ENTRY_DAY_EXISTS: {
    ar: "يوجد سجل ساعات لهذا الإسناد في التاريخ المحدد بالفعل.",
    en: "A work-hours entry already exists for this assignment on the selected date.",
  },
  PROJECT_OS_TIME_ENTRY_TRANSITION_INVALID: {
    ar: "انتقال حالة ساعات العمل المطلوب غير مسموح من حالته الحالية.",
    en: "The requested work-hours transition is not allowed from its current status.",
  },
  PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED: {
    ar: "يلزم ربط حسابك ببطاقة موظف نشطة لعرض مؤشراتك الفردية.",
    en: "Your account must be linked to an active employee record to view individual indicators.",
  },
  PROJECT_OS_PERFORMANCE_EXCLUSION_REASON_REQUIRED: {
    ar: "أدخل سببًا موثقًا وواضحًا لاستبعاد هذا السجل من المؤشر.",
    en: "Enter a clear documented reason before excluding this record from the indicator.",
  },
  PROJECT_OS_PERFORMANCE_SOURCE_NOT_FOUND: {
    ar: "السجل المطلوب استبعاده غير متاح ضمن مؤشر هذا الموظف والمشروع.",
    en: "The record selected for exclusion is not available in this employee's project indicator.",
  },
  PROJECT_OS_PERFORMANCE_SOURCE_ALREADY_EXCLUDED: {
    ar: "هذا السجل مستبعد بالفعل بسبب موثق.",
    en: "This record already has a documented exclusion.",
  },
  PROJECT_OS_PERFORMANCE_OBJECTION_STATEMENT_INVALID: {
    ar: "اكتب اعتراضًا واضحًا لا يقل عن 20 حرفًا قبل الإرسال.",
    en: "Write a clear objection of at least 20 characters before submitting it.",
  },
  PROJECT_OS_PERFORMANCE_SELF_SERVICE_REQUIRED: {
    ar: "لا يمكن تقديم الاعتراض إلا من الموظف صاحب المؤشر.",
    en: "Only the employee who owns this indicator can submit an objection.",
  },
  PROJECT_OS_PERFORMANCE_OBJECTION_NOT_FOUND: {
    ar: "الاعتراض المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected objection is not available in the current project and workspace.",
  },
  PROJECT_OS_PERFORMANCE_OBJECTION_TRANSITION_INVALID: {
    ar: "انتقال حالة الاعتراض المطلوب غير مسموح من حالته الحالية.",
    en: "The requested objection transition is not allowed from its current status.",
  },
  PROJECT_OS_PERFORMANCE_RESOLUTION_REQUIRED: {
    ar: "أدخل ملاحظة معالجة واضحة قبل إغلاق الاعتراض أو رفضه.",
    en: "Enter a clear resolution note before resolving or rejecting an objection.",
  },
  PROJECT_OS_MATERIAL_CODE_EXISTS: {
    ar: "رمز المادة مستخدم بالفعل ضمن مساحة العمل هذه.",
    en: "This material code is already in use in this workspace.",
  },
  PROJECT_OS_MATERIAL_NOT_FOUND: {
    ar: "المادة المحددة غير متاحة ضمن مساحة العمل هذه.",
    en: "The selected material is not available in this workspace.",
  },
  PROJECT_OS_WAREHOUSE_CODE_EXISTS: {
    ar: "رمز المستودع مستخدم بالفعل ضمن هذا المشروع.",
    en: "This warehouse code is already in use in this project.",
  },
  PROJECT_OS_WAREHOUSE_NOT_FOUND: {
    ar: "المستودع المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected warehouse is not available in the current project and workspace.",
  },
  PROJECT_OS_WAREHOUSE_INACTIVE: {
    ar: "لا يمكن تسجيل حركة على مستودع غير نشط.",
    en: "An inventory movement cannot be recorded for an inactive warehouse.",
  },
  PROJECT_OS_INVENTORY_DELTA_INVALID: {
    ar: "كمية حركة المخزون لا تتوافق مع نوع الاستلام أو الصرف أو التعديل.",
    en: "The inventory quantity does not match the selected receipt, issue, or adjustment type.",
  },
  PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK: {
    ar: "لا يمكن أن تؤدي الحركة إلى رصيد مخزون سالب.",
    en: "The movement cannot result in a negative stock balance.",
  },
  PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID: {
    ar: "أدخل كمية صرف موجبة (وتكلفة وحدة موجبة إن أدخلتها).",
    en: "Enter a positive issued quantity (and a positive unit cost if you enter one).",
  },
  PROJECT_OS_MATERIAL_ISSUE_ACTIVITY_WBS_MISMATCH: {
    ar: "النشاط المحدد لا يتبع بند WBS المختار.",
    en: "The selected activity does not belong to the selected WBS item.",
  },
  PROJECT_OS_SUPPLIER_CODE_EXISTS: {
    ar: "رمز المورد مستخدم بالفعل ضمن مساحة العمل هذه.",
    en: "This supplier code is already in use in this workspace.",
  },
  PROJECT_OS_SUPPLIER_NOT_FOUND: {
    ar: "المورد المحدد غير متاح ضمن مساحة العمل هذه.",
    en: "The selected supplier is not available in this workspace.",
  },
  PROJECT_OS_SUPPLIER_INACTIVE: {
    ar: "لا يمكن إنشاء طلب توريد لمورد غير نشط.",
    en: "A procurement requisition cannot be created for an inactive supplier.",
  },
  PROJECT_OS_REQUISITION_NUMBER_EXISTS: {
    ar: "رقم طلب المواد مستخدم بالفعل ضمن هذا المشروع.",
    en: "This procurement requisition number is already in use in this project.",
  },
  PROJECT_OS_REQUISITION_NOT_FOUND: {
    ar: "طلب المواد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected procurement requisition is not available in the current project and workspace.",
  },
  PROJECT_OS_REQUISITION_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب المواد المحدد غير مسموح من حالته الحالية.",
    en: "The requested procurement requisition transition is not allowed from its current status.",
  },
  PROJECT_OS_REQUISITION_ISSUE_INVALID: {
    ar: "يجب أن يكون صرف طلب المواد بحركة صرف سالبة فقط.",
    en: "A material request can only be linked to a negative issue movement.",
  },
  PROJECT_OS_REQUISITION_MATERIAL_MISMATCH: {
    ar: "المادة المصروفة لا تطابق مادة طلب المواد المحدد.",
    en: "The issued material does not match the selected material request.",
  },
  PROJECT_OS_REQUISITION_NOT_ISSUABLE: {
    ar: "لا يمكن صرف هذا الطلب قبل اعتماده أو بعد إغلاقه.",
    en: "This request cannot be issued before approval or after closure.",
  },
  PROJECT_OS_REQUISITION_ISSUE_EXCEEDS_REQUEST: {
    ar: "كمية الصرف تتجاوز الكمية المطلوبة في طلب المواد.",
    en: "The issue quantity exceeds the quantity requested.",
  },
  PROJECT_OS_REQUISITION_CLOSURE_NOT_FULFILLED: {
    ar: "لا يمكن إغلاق طلب المواد قبل صرف كامل كميته المطلوبة.",
    en: "A material request cannot be closed until its full requested quantity is issued.",
  },
  PROJECT_OS_REQUISITION_UNIT_MISMATCH: {
    ar: "وحدة قياس الطلب لا تطابق وحدة المادة المعتمدة.",
    en: "The request unit of measure does not match the approved material unit.",
  },
  PROJECT_OS_REQUISITION_PURCHASE_ORDER_LINK_INVALID: {
    ar: "لا يمكن ربط أمر شراء إلا بطلب مواد معتمد غير مصروف.",
    en: "A purchase order can only be linked to an approved, unissued material request.",
  },
  PROJECT_OS_REQUISITION_PURCHASE_ORDER_ALREADY_LINKED: {
    ar: "هذا الطلب مرتبط بالفعل بأمر شراء ولا يمكن ربطه مرة أخرى.",
    en: "This request is already linked to a purchase order and cannot be linked again.",
  },
  PROJECT_OS_PURCHASE_ORDER_NOT_LINKABLE: {
    ar: "أمر الشراء المحدد ليس في حالة تسمح بربطه بطلب المواد.",
    en: "The selected purchase order is not in a state that allows linking to a material request.",
  },
  PROJECT_OS_GRN_QUANTITY_INVALID: {
    ar: "أدخل كمية مقبولة أو مرفوضة واحدة على الأقل بقيم غير سالبة.",
    en: "Enter at least one accepted or rejected quantity using non-negative values.",
  },
  PROJECT_OS_GRN_REJECTION_EVIDENCE_REQUIRED: {
    ar: "الكمية المرفوضة تتطلب فحص جودة وNCR من المشروع نفسه.",
    en: "A rejected quantity requires a quality inspection and NCR from the same project.",
  },
  PROJECT_OS_GRN_REJECTION_EVIDENCE_NOT_ALLOWED: {
    ar: "لا تسجل أدلة رفض عندما تكون كمية الرفض صفرًا.",
    en: "Rejection evidence cannot be recorded when the rejected quantity is zero.",
  },
  PROJECT_OS_GRN_PURCHASE_ORDER_NOT_ISSUED: {
    ar: "يجب أن يكون أمر الشراء صادرًا قبل تسجيل استلام المواد.",
    en: "The purchase order must be issued before recording a goods receipt.",
  },
  PROJECT_OS_GRN_QUALITY_EVIDENCE_INVALID: {
    ar: "فحص الجودة المحدد غير مقبول كدليل لكمية مرفوضة.",
    en: "The selected quality inspection is not valid evidence for a rejected quantity.",
  },
  PROJECT_OS_GRN_NCR_EVIDENCE_INVALID: {
    ar: "حالة عدم المطابقة المحددة غير مفتوحة لمعالجة الكمية المرفوضة.",
    en: "The selected NCR is not open for the rejected quantity.",
  },
  PROJECT_OS_CLAIM_NOT_FOUND: {
    ar: "المطالبة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected claim is not available in the current project and workspace.",
  },
  PROJECT_OS_CLAIM_TRANSITION_INVALID: {
    ar: "انتقال حالة المطالبة المحدد غير مسموح من حالتها الحالية.",
    en: "The selected claim-status transition is not allowed from its current status.",
  },
  PROJECT_OS_CLAIM_APPROVAL_AMOUNT_REQUIRED: {
    ar: "يلزم إدخال قيمة معتمدة عند اعتماد المطالبة.",
    en: "An approved amount is required when approving a claim.",
  },
  PROJECT_OS_CLAIM_APPROVAL_EXCEEDS_CLAIM: {
    ar: "لا يمكن أن تتجاوز القيمة المعتمدة قيمة المطالبة المطلوبة.",
    en: "The approved amount cannot exceed the claimed amount.",
  },
  PROJECT_OS_ADVISOR_UNAVAILABLE: {
    ar: "تعذر إنشاء النصيحة الاستشارية الآن. لا يغير ذلك أي بيانات للمشروع.",
    en: "The advisory could not be generated now. No project data was changed.",
  },
  PROJECT_OS_ACTIVITY_NOT_FOUND: {
    ar: "النشاط غير موجود في هذا المشروع.",
    en: "The activity was not found in this project.",
  },
  PROJECT_OS_ACTIVITY_WBS_MISMATCH: {
    ar: "النشاط لا يتبع بند العمل المختار.",
    en: "The activity does not belong to the selected work item.",
  },
  PROJECT_OS_ASSIGNMENT_WINDOW_INVALID: {
    ar: "فترة الإسناد غير صالحة: يجب ألا تسبق النهاية البداية.",
    en: "The assignment window is invalid: the end must not be before the start.",
  },
  PROJECT_OS_ATTENDANCE_NOT_FOUND: {
    ar: "سجل الحضور غير موجود.",
    en: "The attendance record was not found.",
  },
  PROJECT_OS_AUTH_FAILED: {
    ar: "تعذّر تسجيل الدخول. حاول مرة أخرى.",
    en: "Sign-in failed. Please try again.",
  },
  PROJECT_OS_AUTH_RATE_LIMITED: {
    ar: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
    en: "Too many attempts. Wait a moment and try again.",
  },
  PROJECT_OS_BOQ_CODE_EXISTS: {
    ar: "رمز بند جدول الكميات مستعمل في هذا المشروع.",
    en: "This BOQ item code is already used in this project.",
  },
  PROJECT_OS_CERTIFICATE_NUMBER_EXISTS: {
    ar: "رقم المستخلص مستعمل في هذا المشروع.",
    en: "This certificate number is already used in this project.",
  },
  PROJECT_OS_DASHBOARD_OWNER_NOT_FOUND: {
    ar: "لا مستلم مؤهل لهذا التنبيه في الشركة.",
    en: "No eligible recipient for this alert was found in the company.",
  },
  PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED: {
    ar: "الإسناد يتجاوز طاقة الموظف في هذه الفترة.",
    en: "The assignment exceeds the employee's capacity for this period.",
  },
  PROJECT_OS_EMPLOYEE_NOT_ACTIVE: {
    ar: "الموظف غير فعّال.",
    en: "The employee is not active.",
  },
  PROJECT_OS_EXPORT_FILE_TOO_LARGE: {
    ar: "ملف التصدير أكبر من الحد المسموح (10 ميغابايت).",
    en: "The export file is larger than the allowed limit (10 MB).",
  },
  PROJECT_OS_GRN_COMMITMENT_INSUFFICIENT: {
    ar: "قيمة الاستلام تتجاوز الرصيد المفتوح من الالتزام.",
    en: "The receipt value exceeds the open balance of the commitment.",
  },
  PROJECT_OS_GRN_COMMITMENT_INVALID: {
    ar: "التزام أمر الشراء غير معتمد أو بعملة مختلفة.",
    en: "The purchase order's commitment is not approved or is in a different currency.",
  },
  PROJECT_OS_GRN_PURCHASE_ORDER_COMMITMENT_REQUIRED: {
    ar: "أمر الشراء بلا التزام؛ اربطه بالتزام قبل تسجيل الاستلام.",
    en: "The purchase order has no commitment; link one before recording a receipt.",
  },
  PROJECT_OS_GRN_UNIT_COST_INVALID: {
    ar: "تكلفة الوحدة يجب أن تكون رقمًا أكبر من صفر.",
    en: "The unit cost must be a number above zero.",
  },
  PROJECT_OS_IMPORT_DUPLICATE_DETECTED: {
    ar: "هذا الملف مستورد سابقًا في هذا المشروع.",
    en: "This file was already imported into this project.",
  },
  PROJECT_OS_IMPORT_FILE_INVALID: {
    ar: "الملف غير صالح أو غير مقروء.",
    en: "The file is invalid or unreadable.",
  },
  PROJECT_OS_IMPORT_FILE_UNAVAILABLE: {
    ar: "تعذّر قراءة الملف المرفوع من التخزين.",
    en: "The uploaded file could not be read from storage.",
  },
  PROJECT_OS_IMPORT_FILE_TOO_LARGE: {
    ar: "حجم الملف أكبر من الحد المسموح به وهو 50 MB.",
    en: "The file is larger than the 50 MB limit.",
  },
  PROJECT_OS_IMPORT_JOB_FAILED: {
    ar: "تعذّر إكمال المعالجة لسبب غير متوقع. لم يُحفظ شيء؛ أعد المحاولة، وإن تكرر فتواصل مع الدعم.",
    en: "Processing could not finish because of an unexpected problem. Nothing was saved; try again, and contact support if it repeats.",
  },
  PROJECT_OS_IMPORT_JOB_STALLED: {
    ar: "توقفت المعالجة قبل اكتمالها ولم تنجح إعادة تشغيلها. لم يُحفظ شيء؛ أعد المحاولة.",
    en: "Processing stopped before it finished and could not be restarted. Nothing was saved; try again.",
  },
  PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID: {
    ar: "مرجع الملف المرفوع لا يخص هذا المشروع.",
    en: "The uploaded file reference does not belong to this project.",
  },
  PROJECT_OS_IMPORT_UPLOAD_MISSING: {
    ar: "لم يصل الملف إلى التخزين. أعد رفعه.",
    en: "The file did not reach storage. Upload it again.",
  },
  PROJECT_OS_IMPORT_FORMAT_INVALID: {
    ar: "صيغة الملف غير مدعومة.",
    en: "The file format is not supported.",
  },
  PROJECT_OS_IMPORT_MAPPING_INVALID: {
    ar: "ربط الأعمدة غير صالح.",
    en: "The column mapping is invalid.",
  },
  PROJECT_OS_IMPORT_MODULE_INVALID: {
    ar: "نوع الاستيراد غير معروف.",
    en: "The import type is not recognised.",
  },
  PROJECT_OS_IMPORT_NOT_CONFIRMABLE: {
    ar: "لا يمكن اعتماد هذا الاستيراد في حالته الحالية.",
    en: "This import cannot be confirmed in its current state.",
  },
  PROJECT_OS_IMPORT_NOT_FOUND: {
    ar: "عملية الاستيراد غير موجودة.",
    en: "The import was not found.",
  },
  PROJECT_OS_IMPORT_VALIDATION_FAILED: {
    ar: "الملف لم يجتز الفحص؛ راجع تقرير الأخطاء ولم يُحفظ شيء.",
    en: "The file did not pass validation; see the error report. Nothing was saved.",
  },
  PROJECT_OS_INVENTORY_TRANSFER_QUANTITY_INVALID: {
    ar: "كمية التحويل يجب أن تكون أكبر من صفر.",
    en: "The transfer quantity must be above zero.",
  },
  PROJECT_OS_INVENTORY_TRANSFER_SAME_WAREHOUSE: {
    ar: "مستودع المصدر والوجهة متطابقان.",
    en: "The source and destination warehouses are the same.",
  },
  PROJECT_OS_INVOICE_NUMBER_EXISTS: {
    ar: "رقم الفاتورة مستعمل في هذا المشروع.",
    en: "This invoice number is already used in this project.",
  },
  PROJECT_OS_LABOR_RESOURCE_REQUIRED: {
    ar: "يجب أن يكون المورد المختار من نوع عمالة.",
    en: "The selected resource must be a labour resource.",
  },
  PROJECT_OS_MASTER_PLAN_RULES_INVALID: {
    ar: "قواعد الخطة الرئيسية غير صالحة.",
    en: "The master plan rules are invalid.",
  },
  PROJECT_OS_MASTER_PLAN_RULE_SAVE_FAILED: {
    ar: "تعذّر حفظ قاعدة الخطة الرئيسية.",
    en: "The master plan rule could not be saved.",
  },
  PROJECT_OS_NOTIFICATION_NOT_FOUND: {
    ar: "التنبيه غير موجود.",
    en: "The notification was not found.",
  },
  PROJECT_OS_OPERATIONAL_ROLE_CATALOG_INVALID: {
    ar: "كتالوج الأدوار التشغيلية غير مكتمل؛ تواصل مع الدعم.",
    en: "The operational role catalogue is incomplete; contact support.",
  },
  PROJECT_OS_PAYROLL_ALLOCATION_EXCEEDS_COST: {
    ar: "مجموع التخصيصات يتجاوز تكلفة الراتب.",
    en: "The allocations exceed the payroll cost.",
  },
  PROJECT_OS_PAYROLL_AMOUNT_INVALID: {
    ar: "مبلغ الراتب غير صالح.",
    en: "The payroll amount is invalid.",
  },
  PROJECT_OS_PAYROLL_APPROVER_SEPARATION: {
    ar: "لا يعتمد مسير الرواتب من أنشأه.",
    en: "A payroll run cannot be approved by the person who created it.",
  },
  PROJECT_OS_PAYROLL_ENTRY_NOT_FOUND: {
    ar: "بند الراتب غير موجود.",
    en: "The payroll entry was not found.",
  },
  PROJECT_OS_PAYROLL_NOT_APPROVED: {
    ar: "مسير الرواتب غير معتمد بعد.",
    en: "The payroll run is not approved yet.",
  },
  PROJECT_OS_PAYROLL_PERIOD_EXISTS: {
    ar: "يوجد مسير رواتب لهذه الفترة.",
    en: "A payroll run already exists for this period.",
  },
  PROJECT_OS_PAYROLL_PERIOD_INVALID: {
    ar: "فترة الرواتب غير صالحة.",
    en: "The payroll period is invalid.",
  },
  PROJECT_OS_PAYROLL_RUN_NOT_FOUND: {
    ar: "مسير الرواتب غير موجود.",
    en: "The payroll run was not found.",
  },
  PROJECT_OS_PAYROLL_STRUCTURE_INVALID: {
    ar: "هيكل الراتب غير صالح.",
    en: "The salary structure is invalid.",
  },
  PROJECT_OS_PAYROLL_TRANSITION_INVALID: {
    ar: "لا يمكن نقل المسير إلى هذه الحالة من حالته الحالية.",
    en: "The payroll run cannot move to that status from its current one.",
  },
  PROJECT_OS_PMC_ACTIVITY_NOT_FOUND: {
    ar: "نشاط الفحص غير موجود.",
    en: "The inspection activity was not found.",
  },
  PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL: {
    ar: "النشاط ليس من نموذج هذه الوحدة.",
    en: "The activity is not part of this unit's model.",
  },
  PROJECT_OS_PMC_IMPORT_FILE_CHANGED: {
    ar: "تغيّر الملف منذ المعاينة؛ أعد رفعه ومعاينته.",
    en: "The file changed since the preview; upload and preview it again.",
  },
  PROJECT_OS_PMC_INSPECTION_ALREADY_ANSWERED: {
    ar: "طلب الفحص أُجيب عنه سابقًا.",
    en: "The inspection request has already been answered.",
  },
  PROJECT_OS_PMC_INSPECTION_CODE_DUPLICATE: {
    ar: "رمز طلب الفحص مستعمل.",
    en: "The inspection request code is already used.",
  },
  PROJECT_OS_PMC_INSPECTION_NOT_AT_RESULT_STEP: {
    ar: "طلب الفحص ليس في خطوة النتيجة.",
    en: "The inspection request is not at the result step.",
  },
  PROJECT_OS_PMC_INSPECTION_NOT_FOUND: {
    ar: "طلب الفحص غير موجود.",
    en: "The inspection request was not found.",
  },
  PROJECT_OS_PMC_INSPECTION_STEP_NOT_ACTIVE: {
    ar: "خطوة طلب الفحص غير فعّالة.",
    en: "The inspection request step is not active.",
  },
  PROJECT_OS_PMC_INSPECTION_UNITS_REQUIRED: {
    ar: "اختر وحدة واحدة على الأقل لطلب الفحص.",
    en: "Select at least one unit for the inspection request.",
  },
  PROJECT_OS_PMC_PLAN_DIMENSIONS_INVALID: {
    ar: "أبعاد صورة المخطط غير صالحة.",
    en: "The site plan image dimensions are invalid.",
  },
  PROJECT_OS_PMC_PLAN_FILE_INVALID: {
    ar: "ملف المخطط غير صالح.",
    en: "The site plan file is invalid.",
  },
  PROJECT_OS_PMC_PLAN_FORMAT_UNSUPPORTED: {
    ar: "صيغة المخطط غير مدعومة.",
    en: "The site plan format is not supported.",
  },
  PROJECT_OS_PMC_SCREEN_UNKNOWN: {
    ar: "شاشة PMC غير معروفة.",
    en: "Unknown PMC screen.",
  },
  PROJECT_OS_PMC_STATUS_CODE_DUPLICATE: {
    ar: "رمز الحالة مستعمل.",
    en: "The status code is already used.",
  },
  PROJECT_OS_PMC_STATUS_FACTORS_INVALID: {
    ar: "معاملات الحالات غير صالحة: يجب ألا تتناقص بتقدّم الحالة وأن تكون بين 0 و1.",
    en: "The status factors are invalid: they must not decrease as the status advances and must be between 0 and 1.",
  },
  PROJECT_OS_PMC_UNIT_NOT_FOUND: {
    ar: "الوحدة غير موجودة.",
    en: "The unit was not found.",
  },
  PROJECT_OS_PMC_VERIFICATION_STATUS_INACTIVE: {
    ar: "حالة التحقق غير فعّالة.",
    en: "The verification status is not active.",
  },
  PROJECT_OS_PMC_VERIFICATION_STATUS_NOT_FOUND: {
    ar: "حالة التحقق غير موجودة.",
    en: "The verification status was not found.",
  },
  PROJECT_OS_REORDER_LEVEL_INVALID: {
    ar: "حد إعادة الطلب يجب أن يكون أكبر من صفر.",
    en: "The reorder level must be above zero.",
  },
  PROJECT_OS_SALARY_STRUCTURE_NOT_FOUND: {
    ar: "هيكل الراتب غير موجود.",
    en: "The salary structure was not found.",
  },
  PROJECT_OS_SCHEDULE_FORMAT_INVALID: {
    ar: "صيغة ملف الجدول غير مدعومة.",
    en: "The schedule file format is not supported.",
  },
  PROJECT_OS_SUBCONTRACT_CODE_EXISTS: {
    ar: "رمز عقد المقاول من الباطن مستعمل.",
    en: "The subcontract code is already used.",
  },
  PROJECT_OS_SUBCONTRACT_NOT_FOUND: {
    ar: "عقد المقاول من الباطن غير موجود.",
    en: "The subcontract was not found.",
  },
  PROJECT_OS_TIME_ENTRY_NOT_FOUND: {
    ar: "إدخال الوقت غير موجود.",
    en: "The time entry was not found.",
  },
  PROJECT_OS_WBS_NOT_FOUND: {
    ar: "بند العمل غير موجود في هذا المشروع.",
    en: "The work item was not found in this project.",
  },
  PROJECT_OS_GRN_WAREHOUSE_REQUIRED: {
    ar: "اختر المستودع الذي يدخله هذا الاستلام، أو سجّله «توريدًا مباشرًا للموقع» إن لم يمرّ بمستودع.",
    en: "Choose the warehouse this receipt goes into, or record it as a direct delivery to site if it never passes through a warehouse.",
  },
  PROJECT_OS_GRN_WAREHOUSE_NOT_ALLOWED: {
    ar: "التوريد المباشر للموقع لا يدخل مستودعًا؛ أزل المستودع أو غيّر نوع الاستلام إلى «يدخل المستودع».",
    en: "A direct delivery to site does not enter a warehouse; remove the warehouse or change the receipt to \"into the warehouse\".",
  },
  PROJECT_OS_INVENTORY_UNIT_COST_INVALID: {
    ar: "تكلفة الوحدة يجب أن تكون موجبة، ولا تُدخَل مع حركة تُخرج مخزونًا (الإخراج يُقيَّم بالمتوسط المرجّح).",
    en: "The unit cost must be positive, and is not entered with a movement that takes stock out (outgoing stock is valued at the weighted average).",
  },
  PROJECT_OS_MATERIAL_ISSUE_COST_REQUIRED: {
    ar: "هذا المخزون بلا سعر مسجَّل، فلا يوجد متوسط يُصرف به. أدخل تكلفة الوحدة لهذا الصرف.",
    en: "This stock has no recorded price, so there is no average to issue it at. Enter the unit cost for this issue.",
  },
  PROJECT_OS_PAYROLL_AUTO_ALREADY_ALLOCATED: {
    ar: "تكلفة هذا الراتب موزَّعة على المشاريع بالفعل. لتعديل حصة استعمل «تعديل الحصة» مع ذكر السبب.",
    en: "This pay has already been allocated to projects. To change a share use \"adjust share\" and give the reason.",
  },
  PROJECT_OS_PAYROLL_AUTO_NO_HOURS: {
    ar: "لا ساعات معتمدة لهذا الموظف في فترة المسير، فلا أساس للتوزيع بالساعات. اعتمد الساعات أولًا أو وزّع يدويًا.",
    en: "This employee has no approved hours in the payroll period, so there is nothing to share the cost by. Approve the hours first or allocate by hand.",
  },
  PROJECT_OS_PAYROLL_ADJUSTMENT_REASON_REQUIRED: {
    ar: "اكتب سبب تعديل الحصة (5 أحرف على الأقل). يُحفظ مع القيمة قبل التعديل وبعده.",
    en: "Give the reason for adjusting the share (at least 5 characters). It is kept with the value before and after.",
  },
  PROJECT_OS_PAYROLL_ADJUSTMENT_NO_CHANGE: {
    ar: "القيمة الجديدة تساوي القيمة الحالية؛ لا شيء يُعدَّل.",
    en: "The new amount equals the current one; there is nothing to adjust.",
  },
  PROJECT_OS_PAYROLL_ALLOCATION_NOT_FOUND: {
    ar: "حصة الراتب المطلوبة غير موجودة في هذه الشركة.",
    en: "The pay allocation was not found in this company.",
  },
  PROJECT_OS_CONTRACT_SUPPLIER_REQUIRED: {
    ar: "العقد مع مورد: اختر المورد من سجل الموردين.",
    en: "A contract with a supplier needs the supplier chosen from the supplier register.",
  },
  PROJECT_OS_CONTRACT_COUNTERPARTY_KIND_MISMATCH: {
    ar: "اخترتَ موردًا من السجل لكن نوع الطرف المقابل ليس «مورد».",
    en: "A supplier was chosen from the register but the counterparty type is not \"supplier\".",
  },
  PROJECT_OS_INVENTORY_REASON_REQUIRED: {
    ar: "اكتب سبب التحويل أو التسوية (3 أحرف على الأقل).",
    en: "Give the reason for the transfer or adjustment (at least 3 characters).",
  },
  PROJECT_OS_PAYROLL_ALLOCATION_TIME_COSTED: {
    ar: "ساعات هذا الموظف في فترة المسير محتسبة تكلفتها فعلًا عبر إدخالات الوقت المعتمدة؛ تخصيص الراتب نفسه يعدّ التكلفة مرتين.",
    en: "This employee's hours in the payroll period were already costed through approved time entries; allocating the same pay would count the cost twice.",
  },
  PROJECT_OS_TIME_ENTRY_PAYROLL_ALLOCATED: {
    ar: "راتب هذا الموظف في هذه الفترة مخصَّص للمشاريع من مسير الرواتب؛ اعتماد ساعاته يعدّ التكلفة مرتين.",
    en: "This employee's pay for the period is already allocated to projects from payroll; approving these hours would count the cost twice.",
  },
  PROJECT_OS_SIGNUP_EMAIL_NOT_VERIFIED: {
    ar: "أكّد بريدك الإلكتروني أولًا: سجّل الدخول برمز يصلك على بريدك أو بحساب Google ثم أعد إنشاء مساحة العمل.",
    en: "Verify your email first: sign in with the code sent to your address or with Google, then create the workspace again.",
  },
  PROJECT_OS_PURCHASE_ORDER_SUPPLIER_REQUIRED: {
    ar: "اختر المورد من سجل الموردين أو اكتب اسم المورد.",
    en: "Choose the supplier from the supplier register or type the supplier's name.",
  },
  PROJECT_OS_RATE_LIMITED: {
    ar: "تجاوزت عدد الطلبات المسموح به في الدقيقة. انتظر قليلًا ثم أعد المحاولة.",
    en: "You have sent more requests than allowed per minute. Wait a moment and try again.",
  },
  PROJECT_OS_SERVER_ERROR: {
    ar: "حدث خطأ في الخادم وسُجّل لدى فريق التشغيل. أعد المحاولة بعد قليل.",
    en: "A server error occurred and was recorded for the operations team. Try again shortly.",
  },
  PROJECT_OS_REQUEST_TOO_LARGE: {
    ar: "حجم البيانات المرسلة أكبر من الحد المسموح به.",
    en: "The data sent is larger than allowed.",
  },
  PROJECT_OS_NOT_FOUND: {
    ar: "العنوان المطلوب غير موجود.",
    en: "The requested address does not exist.",
  },
  PROJECT_OS_REQUEST_FAILED: {
    ar: "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة.",
    en: "We could not complete the request. Check the details and try again.",
  },
  PROJECT_OS_DESIGN_DUPLICATE: {
    ar: "الرقم المدخل مستعمل من قبل في هذا المشروع (رقم مخطط أو مراجعة أو إحالة أو ملاحظة أو تقديم).",
    en: "That number is already used in this project (drawing, revision, transmittal, comment or submittal).",
  },
  PROJECT_OS_DESIGN_DRAWING_NOT_FOUND: {
    ar: "المخطط المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected drawing is not available in the current project and workspace.",
  },
  PROJECT_OS_DESIGN_REVISION_NOT_FOUND: {
    ar: "مراجعة المخطط المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected drawing revision is not available in the current project and workspace.",
  },
  PROJECT_OS_DESIGN_DRAWING_CANCELLED: {
    ar: "المخطط ملغى؛ لا تُجرى عليه عمليات جديدة.",
    en: "The drawing is cancelled; no new operations are allowed on it.",
  },
  PROJECT_OS_DESIGN_DRAWING_APPROVED: {
    ar: "المخطط معتمد للتنفيذ؛ أصدر مراجعة جديدة قبل إضافة ملاحظات عليه.",
    en: "The drawing is approved for construction; issue a new revision before adding comments to it.",
  },
  PROJECT_OS_DESIGN_APPROVAL_STATE_INVALID: {
    ar: "لا يُعتمد المخطط إلا وهو قيد المراجعة (أي بعد إرساله في إحالة).",
    en: "A drawing can be approved only while it is under review (after it has been sent in a transmittal).",
  },
  PROJECT_OS_DESIGN_OPEN_COMMENTS: {
    ar: "لا يُعتمد المخطط وفيه ملاحظات مراجعة لم تُغلق على مراجعته الحالية.",
    en: "A drawing cannot be approved while review comments on its current revision are not closed.",
  },
  PROJECT_OS_DESIGN_SELF_APPROVAL: {
    ar: "من أصدر المراجعة لا يعتمدها؛ يلزم شخص آخر يملك صلاحية الاعتماد.",
    en: "Whoever issued the revision cannot approve it; another person with approval authority is needed.",
  },
  PROJECT_OS_DESIGN_TRANSMITTAL_NOT_FOUND: {
    ar: "الإحالة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected transmittal is not available in the current project and workspace.",
  },
  PROJECT_OS_DESIGN_TRANSMITTAL_EMPTY: {
    ar: "اختر مخططًا واحدًا على الأقل لتضمينه في الإحالة.",
    en: "Select at least one drawing revision to include in the transmittal.",
  },
  PROJECT_OS_DESIGN_TRANSMITTAL_TRANSITION_INVALID: {
    ar: "انتقال حالة الإحالة غير مسموح من حالتها الحالية.",
    en: "That transmittal-status transition is not allowed from its current status.",
  },
  PROJECT_OS_DESIGN_COMMENT_NOT_FOUND: {
    ar: "ملاحظة المراجعة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected review comment is not available in the current project and workspace.",
  },
  PROJECT_OS_DESIGN_COMMENT_TRANSITION_INVALID: {
    ar: "انتقال حالة الملاحظة غير مسموح من حالتها الحالية.",
    en: "That comment-status transition is not allowed from its current status.",
  },
  PROJECT_OS_DESIGN_COMMENT_RESPONSE_REQUIRED: {
    ar: "اكتب ردًّا على الملاحظة قبل تسجيله.",
    en: "Write a response to the comment before recording it.",
  },
  PROJECT_OS_DESIGN_SELF_CLOSE: {
    ar: "من ردّ على الملاحظة لا يغلقها؛ يلزم شخص آخر يملك صلاحية الاعتماد.",
    en: "Whoever answered a comment cannot close it; another person with approval authority is needed.",
  },
  PROJECT_OS_DESIGN_SUBMITTAL_NOT_FOUND: {
    ar: "التقديم المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected submittal is not available in the current project and workspace.",
  },
  PROJECT_OS_DESIGN_SUBMITTAL_TRANSITION_INVALID: {
    ar: "انتقال حالة التقديم غير مسموح من حالته الحالية.",
    en: "That submittal-status transition is not allowed from its current status.",
  },
  PROJECT_OS_DESIGN_REPLY_CODE_REQUIRED: {
    ar: "اختر رمز رد الاستشاري (A أو B أو C أو D).",
    en: "Choose the consultant's reply code (A, B, C or D).",
  },
  PROJECT_OS_DESIGN_SELF_REPLY: {
    ar: "من أرسل التقديم لا يسجّل رد الاستشاري عليه؛ يلزم شخص آخر يملك صلاحية الاعتماد.",
    en: "Whoever sent the submittal cannot record the consultant's reply to it; another person with approval authority is needed.",
  },
  PROJECT_OS_DESIGN_RESUBMISSION_INVALID: {
    ar: "لا يُعاد تقديم إلا ما ردّ عليه الاستشاري بالرمز C أو D.",
    en: "Only a submittal the consultant answered with C or D can be resubmitted.",
  },
  PROJECT_OS_TENDER_DUPLICATE: {
    ar: "الرمز المدخل مستعمل من قبل في هذا المشروع (حزمة مناقصة أو عقد أو التزام).",
    en: "That code is already used in this project (tender package, contract or commitment).",
  },
  PROJECT_OS_TENDER_NOT_FOUND: {
    ar: "حزمة المناقصة المحددة غير متاحة ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected tender package is not available in the current project and workspace.",
  },
  PROJECT_OS_TENDER_SUPPLIER_NOT_FOUND: {
    ar: "المورد المحدد غير موجود في سجل الموردين أو غير نشط.",
    en: "The selected supplier is not in the supplier register or is not active.",
  },
  PROJECT_OS_TENDER_INVITATION_CLOSED: {
    ar: "لا تُضاف دعوات بعد إغلاق باب العروض أو الترسية أو الإلغاء.",
    en: "Invitations cannot be added once bidding is closed, awarded or cancelled.",
  },
  PROJECT_OS_TENDER_TRANSITION_INVALID: {
    ar: "انتقال حالة المناقصة غير مسموح من حالتها الحالية.",
    en: "That tender-status transition is not allowed from its current status.",
  },
  PROJECT_OS_TENDER_NO_INVITEES: {
    ar: "ادعُ موردًا واحدًا على الأقل قبل فتح باب العروض.",
    en: "Invite at least one supplier before opening the tender.",
  },
  PROJECT_OS_TENDER_NOT_OPEN: {
    ar: "باب العروض غير مفتوح؛ لا تُدخل العروض ولا تُعدَّل ولا تُسحب إلا والمناقصة مفتوحة.",
    en: "Bidding is not open; bids can be entered, revised or withdrawn only while the tender is open.",
  },
  PROJECT_OS_TENDER_NOT_CLOSED: {
    ar: "هذه العملية لا تتم إلا بعد إغلاق باب العروض وقبل الترسية.",
    en: "This operation is possible only after bidding is closed and before the award.",
  },
  PROJECT_OS_TENDER_NOT_INVITED: {
    ar: "هذا المورد غير مدعو إلى هذه المناقصة.",
    en: "This supplier was not invited to this tender.",
  },
  PROJECT_OS_TENDER_BID_EXISTS: {
    ar: "لهذا المورد عرض مسجل في هذه المناقصة؛ عدّله بدل إدخال عرض ثانٍ.",
    en: "This supplier already has a bid in this tender; revise it instead of entering a second one.",
  },
  PROJECT_OS_TENDER_BID_NOT_FOUND: {
    ar: "العرض المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected bid is not available in the current project and workspace.",
  },
  PROJECT_OS_TENDER_BID_STATE_INVALID: {
    ar: "حالة العرض لا تسمح بهذه العملية (مسحوب أو مستبعد).",
    en: "The bid's status does not allow this operation (withdrawn or disqualified).",
  },
  PROJECT_OS_TENDER_REASON_REQUIRED: {
    ar: "اكتب سبب الاستبعاد.",
    en: "Write the reason for the disqualification.",
  },
  PROJECT_OS_TENDER_ADJUSTMENT_SIGN: {
    ar: "إشارة المبلغ لا تناسب نوع التسوية: الخصم سالب، وثغرة النطاق والاستثناء موجبان، والتصحيح بأي إشارة.",
    en: "The amount's sign does not fit the adjustment kind: a discount is negative, a scope gap or exclusion is positive, a correction may be either.",
  },
  PROJECT_OS_TENDER_ADJUSTMENT_NOT_FOUND: {
    ar: "بند التسوية المحدد غير متاح.",
    en: "The selected adjustment is not available.",
  },
  PROJECT_OS_TENDER_BID_NOT_ELIGIBLE: {
    ar: "لا تُرسى المناقصة على عرض مسحوب أو مستبعد.",
    en: "A tender cannot be awarded to a withdrawn or disqualified bid.",
  },
  PROJECT_OS_TENDER_SELF_AWARD: {
    ar: "من أدخل عروض هذه المناقصة لا يرسّيها؛ يلزم شخص آخر يملك صلاحية الترسية.",
    en: "Whoever entered this tender's bids cannot award it; another person with award authority is needed.",
  },
  PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED: {
    ar: "بأقل من عرضين صالحين للمقارنة يلزم تسبيب كتابي للترسية (10 أحرف على الأقل).",
    en: "With fewer than two comparable bids a written justification (at least 10 characters) is required to award.",
  },
  PROJECT_OS_MASTER_PLAN_CALIBRATION_INVALID: {
    ar: "أدخل عرض منطقة الخطة وطولها بالأمتار معًا، وكلاهما رقم موجب لا يتجاوز 100000.",
    en: "Enter the plan area's width and length in metres together; both must be positive and at most 100000.",
  },
  PROJECT_OS_MASTER_PLAN_ROTATION_INVALID: {
    ar: "زاوية التدوير غير صالحة.",
    en: "The rotation angle is not valid.",
  },
  PROJECT_OS_MASTER_PLAN_NOTHING_TO_CHANGE: {
    ar: "لم تُحدَّد أي قيمة للتعديل.",
    en: "Nothing was given to change.",
  },
  PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_FOUND: {
    ar: "العرض المحفوظ المحدد غير متاح لك.",
    en: "The selected saved view is not available to you.",
  },
  PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_OWNER: {
    ar: "وحده من حفظ العرض يقرر مشاركته.",
    en: "Only the person who saved the view decides whether it is shared.",
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
