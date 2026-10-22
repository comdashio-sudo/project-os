// In-memory stand-in for server/storage.ts in the database tests, where no storage
// bucket exists. Same exports; a "signed URL" is a data: URL holding the bytes,
// so code that fetches the URL still works.
import type * as StorageModule from "../storage";

export function memoryStorageModule(actual: typeof StorageModule) {
  const files = new Map<string, { body: Buffer; type: string }>();
  const dataUrl = (key: string) => {
    const file = files.get(key);
    if (!file) throw new Error(`memory storage has no object ${key}`);
    return `data:${file.type};base64,${file.body.toString("base64")}`;
  };
  return {
    ...actual,
    storagePut: async (relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream") => {
      const key = actual.appendHashSuffix(actual.normalizeKey(relKey));
      files.set(key, { body: Buffer.from(data as never), type: contentType });
      return { key, url: dataUrl(key) };
    },
    storageGet: async (relKey: string) => ({ key: actual.normalizeKey(relKey), url: dataUrl(actual.normalizeKey(relKey)) }),
    storageGetSignedUrl: async (relKey: string) => dataUrl(actual.normalizeKey(relKey)),
    storageDelete: async (relKey: string) => { files.delete(actual.normalizeKey(relKey)); },
  };
}
