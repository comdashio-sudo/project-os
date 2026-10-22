// The largest file a person may pick for an upload. Files travel inside the request body (base64), and the host may cap a request body:
// on Vercel it is 4.5 MB, so the Vercel build sets VITE_MAX_UPLOAD_BYTES (scripts/build-vercel.mjs) to a size whose base64 form fits.
// Elsewhere the default is the server's own ceiling of 10 MB. The screen says so up front instead of the host refusing the request.
const configured = Number(import.meta.env?.VITE_MAX_UPLOAD_BYTES);
export const MAX_UPLOAD_BYTES = Number.isFinite(configured) && configured > 0 ? configured : 10 * 1024 * 1024;
/** "10" or "3" — whole megabytes when it is one, otherwise one decimal. */
export const MAX_UPLOAD_MB = Number.isInteger(MAX_UPLOAD_BYTES / 1048576) ? String(MAX_UPLOAD_BYTES / 1048576) : (MAX_UPLOAD_BYTES / 1048576).toFixed(1);
