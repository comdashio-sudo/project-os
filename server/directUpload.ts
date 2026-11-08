// Direct upload for the two places that still carried a file inside the request (G-139): a document's attachment and the PMC site plan.
// The browser PUTs the file to Storage on a signed URL (so the host's 4.5 MB request ceiling does not apply, up to 50 MB), then calls the screen's own procedure with the
// `uploadKey` instead of the base64 body; that procedure reads the bytes back with `takeDirectUpload` and goes through exactly the checks it always had.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb, getTenantAccessSnapshot, ensureDefaultCommercialCatalog } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { DIRECT_UPLOAD_PURPOSES, safeUploadFileName, uploadPrefix, type DirectUploadPurpose } from "./directUploadKeys";
import { MAX_DIRECT_UPLOAD_BYTES, storageCreateUploadUrl } from "./storage";

export { DIRECT_UPLOAD_PURPOSES, takeDirectUpload, type DirectUploadPurpose } from "./directUploadKeys";

const ALLOWED_TYPES: Record<DirectUploadPurpose, RegExp> = {
  // a document is any file with a plain media type; the screen keeps its own rules about what it accepts
  document: /^[a-z]+\/[A-Za-z0-9.+-]+$/,
  sitePlan: /^image\/(png|jpeg)$/,
  // a photo in a daily site report (work order 12, item 4)
  sitePhoto: /^image\/(png|jpeg|webp)$/,
  // a drawing of a Master Plan (G-189): PDF, PNG, JPEG or a DXF text file; the server checks the content itself
  masterPlanDrawing: /^(application\/(pdf|dxf|octet-stream)|image\/(png|jpeg)|image\/vnd\.dxf|text\/plain)$/,
  // a party's logo on the project profile (D-42 a): PNG, JPEG or SVG; the server reads the bytes (and refuses an SVG carrying script) in projectProfile.ts
  logo: /^image\/(png|jpeg|svg\+xml)$/,
};
/** The permission the module's own procedure requires, so a person can upload exactly when they could have attached the file before. */
async function authorizeDirectUpload(input: { userId: number; tenantId: string; projectId: string; purpose: DirectUploadPurpose }) {
  if (input.purpose === "sitePlan") {
    const db = await getDb();
    if (!db) throw new Error("Database connection is not available");
    await ensureDefaultCommercialCatalog(db);
    await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.pmc.manage", featureCode: "PMC", scope: { type: "project", id: input.projectId } });
    await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
    return;
  }
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: input.purpose === "sitePhoto" ? "project.field.manage" : input.purpose === "logo" ? "project.manage" : "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
}

/** The URL the browser uploads to. Nothing is recorded: an abandoned upload is only an object the sweep removes. */
export async function createDirectUpload(input: { userId: number; tenantId: string; projectId: string; purpose: DirectUploadPurpose; fileName: string; contentType: string }) {
  await authorizeDirectUpload(input);
  if (!ALLOWED_TYPES[input.purpose].test(input.contentType)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_UPLOAD_TYPE_INVALID" });
  const key = `${uploadPrefix(input)}${randomUUID()}/${safeUploadFileName(input.fileName)}`;
  const upload = await storageCreateUploadUrl(key, input.contentType);
  return { uploadKey: upload.key, uploadUrl: upload.url, headers: upload.headers, expiresInSeconds: upload.expiresInSeconds, maxBytes: MAX_DIRECT_UPLOAD_BYTES };
}
