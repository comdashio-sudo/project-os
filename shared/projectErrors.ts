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
