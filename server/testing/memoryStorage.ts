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
    storageCreateUploadUrl: async (relKey: string, contentType = "application/octet-stream") => ({ key: actual.normalizeKey(relKey), url: `memory://upload/${actual.normalizeKey(relKey)}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 }),
    storageHead: async (relKey: string) => { const file = files.get(actual.normalizeKey(relKey)); return file ? { size: file.body.length, contentType: file.type } : null; },
    storageRead: async (relKey: string) => { const file = files.get(actual.normalizeKey(relKey)); if (!file) throw new Error(`memory storage has no object ${relKey}`); return file.body; },
    /** Test-only: what the browser's PUT does against the presigned URL. */
    simulateBrowserUpload: (relKey: string, data: Buffer | Uint8Array, contentType = "application/octet-stream") => { files.set(actual.normalizeKey(relKey), { body: Buffer.from(data as never), type: contentType }); },
    storageList: async (prefix: string) => Array.from(files.keys()).filter(key => key.startsWith(actual.normalizeKey(prefix))).map(key => ({ key, lastModified: new Date() })),
    storageDelete: async (relKey: string) => { files.delete(actual.normalizeKey(relKey)); },
  };
}
