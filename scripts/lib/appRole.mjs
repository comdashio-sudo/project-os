// The restricted application role's login, set the way the connecting account is allowed to set it (launch run 33: `ALTER ROLE ... NOSUPERUSER ... NOBYPASSRLS` is refused with
// 42501 to Supabase's `postgres`, which is not a superuser -- PostgreSQL lets only a superuser even NAME those attributes in an ALTER ROLE). The role is CREATED with every
// restriction spelled out; a non-superuser owner then sets only LOGIN and the password; and in every case the attributes are READ BACK and the run stops if the role holds any power
// it must not have. The guard is the read-back, not the statement.
export const FORBIDDEN_ROLE_ATTRIBUTES = ["rolsuper", "rolcreatedb", "rolcreaterole", "rolbypassrls", "rolreplication"];

export async function setAppRoleLogin(client, password) {
  const { rows: [me] } = await client.query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user");
  const attributes = me?.rolsuper ? "WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION" : "WITH LOGIN";
  await client.query(`ALTER ROLE project_os_app ${attributes} PASSWORD ${client.escapeLiteral(password)}`);
  const { rows: [role] } = await client.query("SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = 'project_os_app'");
  const excess = FORBIDDEN_ROLE_ATTRIBUTES.filter(name => role?.[name]);
  if (!role?.rolcanlogin || excess.length) {
    throw Object.assign(new Error("project_os_app does not have exactly the restricted attributes"), { code: "ROLE_ATTRIBUTES", excess: excess.map(name => name.replace(/^rol/, "")), canLogin: Boolean(role?.rolcanlogin) });
  }
  return { ownerIsSuperuser: Boolean(me?.rolsuper) };
}

/** What the owner reads in the run summary, in Arabic: the stage that failed, the SQLSTATE, and what it usually means. Never a statement, never a password. */
export function explainProvisioningFailure(stage, code, extra = {}) {
  const hints = {
    "42501": "الحساب المتصل لا يملك صلاحية هذه العملية على الدور.",
    "28P01": "كلمة مرور قاعدة Supabase (SUPABASE_DB_PASSWORD) مرفوضة.",
    "28000": "اسم المستخدم أو الاتصال مرفوض.",
    ROLE_ATTRIBUTES: `الدور project_os_app يحمل صلاحيات لا يجوز أن يحملها (${(extra.excess ?? []).join("، ") || "—"})${extra.canLogin === false ? " أو لا يستطيع الدخول" : ""}. لم يُقبل الدور ولم تُكمل الخطوات بعده. لا تُضعَف الحماية: صحّح الدور في Supabase ثم أعد التشغيل.`,
  };
  return `فشل إثبات حماية سجل التدقيق في خطوة «${stage}» برمز ${code}. ${hints[code] ?? "سبب غير معروف؛ افتح سجل خطوة قاعدة البيانات."} سجل التدقيق يبقى للإلحاق فقط، والتريغرات وسحب الصلاحيات كما هي.`;
}
