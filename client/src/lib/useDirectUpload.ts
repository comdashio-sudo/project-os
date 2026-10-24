import { trpc } from "@/lib/trpc";
import { putToStorage } from "@/lib/uploadLimit";
import { useState } from "react";

/**
 * The browser's half of the direct upload (G-139): ask the server for a signed URL, PUT the file straight to Storage (so no request body carries it and the host's
 * 4.5 MB ceiling does not apply, up to 50 MB), and hand back the `uploadKey` the screen's own procedure takes instead of a base64 body.
 */
export function useDirectUpload(scope: { tenantId: string; projectId: string; purpose: "document" | "sitePlan" | "sitePhoto" }) {
  const create = trpc.directUploads.create.useMutation();
  const [percent, setPercent] = useState<number | null>(null);
  const upload = async (file: File, contentType: string) => {
    const target = await create.mutateAsync({ ...scope, fileName: file.name, contentType });
    setPercent(0);
    try { await putToStorage(target.uploadUrl, target.headers, file, setPercent); } finally { setPercent(null); }
    return target.uploadKey;
  };
  return { upload, percent, busy: create.isPending || percent !== null };
}
