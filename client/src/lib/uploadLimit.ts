// The largest file a person may pick for an upload. Files travel inside the request body (base64), and the host may cap a request body:
// on Vercel it is 4.5 MB, so the Vercel build sets VITE_MAX_UPLOAD_BYTES (scripts/build-vercel.mjs) to a size whose base64 form fits.
// Elsewhere the default is the server's own ceiling of 10 MB. The screen says so up front instead of the host refusing the request.
import { formatNumber } from "@/components/ds/format";
const configured = Number(import.meta.env?.VITE_MAX_UPLOAD_BYTES);
export const MAX_UPLOAD_BYTES = Number.isFinite(configured) && configured > 0 ? configured : 10 * 1024 * 1024;
/** "10" or "3" — whole megabytes when it is one, otherwise one decimal. */
export const MAX_UPLOAD_MB = Number.isInteger(MAX_UPLOAD_BYTES / 1048576) ? String(MAX_UPLOAD_BYTES / 1048576) : formatNumber(MAX_UPLOAD_BYTES / 1048576, 1);

// Import files do not travel inside a request body: the browser PUTs them straight to Supabase Storage on a signed URL, so the host's 4.5 MB request
// ceiling does not apply. The ceiling here is the product's own (owner decision, work order 6) and the server enforces the same 50 MB.
export const MAX_IMPORT_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_UPLOAD_MB = String(MAX_IMPORT_UPLOAD_BYTES / 1048576);

export class UploadFailure extends Error {
  constructor(readonly status: number) { super(`upload failed (${status})`); }
}

/** PUTs the file to its signed URL and reports 0-100 as it goes (fetch cannot report upload progress, XMLHttpRequest can). */
export function putToStorage(url: string, headers: Record<string, string>, file: Blob, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100))); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadFailure(request.status)));
    request.onerror = () => reject(new UploadFailure(0));
    request.onabort = () => reject(new UploadFailure(0));
    request.send(file);
  });
}
