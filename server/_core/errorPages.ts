// What a person sees when the server fails while they are navigating: a page in Arabic first and English below it, with no stack, no
// message from the failure, and a request number they can quote to support. It has no script and loads nothing from anywhere.
export type ErrorPageKind = "server" | "unavailable" | "bad_request" | "too_large" | "not_found";

const TEXT: Record<ErrorPageKind, { status: number; ar: [string, string]; en: [string, string] }> = {
  server: { status: 500, ar: ["حدث خطأ في الخادم", "لم نتمكن من إتمام طلبك، وسُجّل الخطأ لدى فريق التشغيل. أعد المحاولة بعد قليل."], en: ["A server error occurred", "We could not complete your request and the error was recorded for the operations team. Please try again shortly."] },
  unavailable: { status: 503, ar: ["الخدمة غير متاحة مؤقتًا", "الخدمة مشغولة أو قيد الصيانة. أعد المحاولة بعد دقائق."], en: ["The service is temporarily unavailable", "The service is busy or under maintenance. Please try again in a few minutes."] },
  bad_request: { status: 400, ar: ["الطلب غير صالح", "تعذّر فهم الطلب المرسل. عُد إلى الصفحة الرئيسية وأعد المحاولة."], en: ["Invalid request", "The request could not be understood. Go back to the home page and try again."] },
  too_large: { status: 413, ar: ["الطلب أكبر من المسموح", "حجم البيانات المرسلة أكبر من الحد المسموح به."], en: ["The request is too large", "The data sent is larger than allowed."] },
  not_found: { status: 404, ar: ["الصفحة غير موجودة", "العنوان الذي طلبته غير موجود."], en: ["Page not found", "The address you asked for does not exist."] },
};

export const errorPageStatus = (kind: ErrorPageKind) => TEXT[kind].status;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function errorPageHtml(kind: ErrorPageKind, requestId?: string): string {
  const t = TEXT[kind];
  const reference = requestId && /^[A-Za-z0-9-]{8,64}$/.test(requestId) ? requestId : "";
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(t.ar[0])} — PROJECT OS</title>
<style>body{margin:0;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;background:#f4f6f8;color:#14232b;display:grid;min-height:100vh;place-items:center;padding:16px}main{max-width:520px;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 4px #0002}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 14px;line-height:1.7;color:#3b4c55}.en{direction:ltr;text-align:left;border-top:1px solid #e1e6ea;padding-top:14px;margin-top:6px}.en h2{font-size:17px;margin:0 0 6px}a{display:inline-block;background:#123a4a;color:#fff;border-radius:10px;padding:10px 16px;text-decoration:none;margin-inline-end:8px}small{display:block;margin-top:14px;color:#6a7a83;direction:ltr;text-align:center}</style></head>
<body><main><h1>${escapeHtml(t.ar[0])}</h1><p>${escapeHtml(t.ar[1])}</p><p><a href="/">الصفحة الرئيسية</a><a href="">إعادة المحاولة</a></p>
<div class="en"><h2>${escapeHtml(t.en[0])}</h2><p>${escapeHtml(t.en[1])}</p></div>${reference ? `<small>رقم الطلب · Request ID: ${escapeHtml(reference)}</small>` : ""}</main></body></html>`;
}
