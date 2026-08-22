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
    ar: "الدور المحدد غير متاح ضمن هذه المؤسسة.",
    en: "The selected role is not available in this organization.",
  },
  PROJECT_OS_ROLE_CODE_EXISTS: {
    ar: "رمز الدور مستخدم بالفعل ضمن هذه المؤسسة.",
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
    ar: "العضوية المحددة غير متاحة ضمن هذه المؤسسة.",
    en: "The selected membership is not available in this organization.",
  },
  PROJECT_OS_ROLE_ASSIGNMENT_EXISTS: {
    ar: "الدور والنطاق المحددان مسندان بالفعل إلى هذه العضوية.",
    en: "This role and scope are already assigned to the selected membership.",
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
    ar: "إسناد الدور المحدد غير متاح ضمن هذه المؤسسة.",
    en: "The selected role assignment is not available in this organization.",
  },
  PROJECT_OS_MEMBER_ALREADY_EXISTS: {
    ar: "للمستخدم المحدد عضوية قائمة ضمن هذه المؤسسة.",
    en: "The selected user already has a membership in this organization.",
  },
  PROJECT_OS_INVITATION_ALREADY_PENDING: {
    ar: "توجد دعوة معلقة بالفعل لهذا البريد ضمن المؤسسة.",
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
    ar: "المحفظة المحددة غير متاحة ضمن هذه المؤسسة.",
    en: "The selected portfolio is not available in this organization.",
  },
  PROJECT_OS_PROGRAM_NOT_FOUND: {
    ar: "البرنامج المحدد غير متاح ضمن هذه المؤسسة.",
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
    ar: "العقد أو الالتزام المحدد لا يطابق المستأجر والمشروع الحاليين.",
    en: "The selected contract or commitment does not belong to the current tenant and project.",
  },
  PROJECT_OS_CONTROL_LINK_REFERENCE_INVALID: {
    ar: "سجل المصدر أو الهدف المحدد لا يطابق المستأجر والمشروع الحاليين.",
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
    ar: "أدخل كمية صرف وتكلفة وحدة موجبتين.",
    en: "Enter a positive issued quantity and unit cost.",
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
    ar: "رقم طلب التوريد مستخدم بالفعل ضمن هذا المشروع.",
    en: "This procurement requisition number is already in use in this project.",
  },
  PROJECT_OS_REQUISITION_NOT_FOUND: {
    ar: "طلب التوريد المحدد غير متاح ضمن المشروع ومساحة العمل الحاليين.",
    en: "The selected procurement requisition is not available in the current project and workspace.",
  },
  PROJECT_OS_REQUISITION_TRANSITION_INVALID: {
    ar: "انتقال حالة طلب التوريد المحدد غير مسموح من حالته الحالية.",
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
  PROJECT_OS_REQUEST_FAILED: {
    ar: "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة.",
    en: "We could not complete the request. Check the details and try again.",
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
