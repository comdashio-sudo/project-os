// The key rules of the direct upload (see directUpload.ts), kept free of database imports so any screen's service can read an upload back without an import cycle.
import { TRPCError } from "@trpc/server";
import { MAX_DIRECT_UPLOAD_BYTES, storageDelete, storageHead, storageRead } from "./storage";

export const DIRECT_UPLOAD_PURPOSES = ["document", "sitePlan", "sitePhoto", "masterPlanDrawing", "logo"] as const;
export type DirectUploadPurpose = (typeof DIRECT_UPLOAD_PURPOSES)[number];

// letters of any script survive in the object key (Arabic file names are normal here); anything that could act as a path or control character becomes "_"
export const safeUploadFileName = (name: string) => name.normalize("NFKC").replace(/[^A-Za-z0-9._\-\u0600-\u06FF\u0750-\u077F]+/g, "_").replace(/^[._]+/, "").slice(0, 120) || "file";
export const uploadPrefix = (input: { tenantId: string; projectId: string; purpose: DirectUploadPurpose }) => `uploads/${input.tenantId}/${input.projectId}/${input.purpose}/pending/`;

/**
 * The bytes of an upload this server issued for exactly this company, project and purpose. The caller has already authorised the action it is about to take;
 * the key check here is what stops one company's object from becoming another's. `discard` removes the pending object once the caller has stored the content for good.
 */
export async function takeDirectUpload(input: { tenantId: string; projectId: string; purpose: DirectUploadPurpose; uploadKey: string; maxBytes?: number; tooLarge?: string }) {
  if (!input.uploadKey.startsWith(uploadPrefix(input)) || input.uploadKey.split("/").some(part => part === ".." || part === ".")) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID" });
  const head = await storageHead(input.uploadKey);
  if (!head) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_UPLOAD_MISSING" });
  // the purpose's own ceiling (a logo: 2 MB) is checked on the object's size BEFORE its bytes are read, so an oversized file is never pulled into memory
  const ceiling = Math.min(input.maxBytes ?? MAX_DIRECT_UPLOAD_BYTES, MAX_DIRECT_UPLOAD_BYTES);
  if (head.size <= 0 || head.size > ceiling) {
    await storageDelete(input.uploadKey).catch(() => undefined);
    throw new TRPCError({ code: "BAD_REQUEST", message: head.size <= 0 ? "PROJECT_OS_IMPORT_FILE_INVALID" : head.size > MAX_DIRECT_UPLOAD_BYTES ? "PROJECT_OS_IMPORT_FILE_TOO_LARGE" : input.tooLarge ?? "PROJECT_OS_IMPORT_FILE_TOO_LARGE" });
  }
  const bytes = await storageRead(input.uploadKey);
  if (bytes.length !== head.size) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  return { bytes, discard: () => storageDelete(input.uploadKey).catch(() => undefined) };
}
