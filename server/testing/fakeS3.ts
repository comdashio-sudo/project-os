// A small S3-compatible HTTP server for the tests (path-style, in memory), so the REAL storage module runs against a real socket:
// presigned PUT / GET URLs are fetched over HTTP, HEAD / GET / DELETE / list go through the AWS SDK client. It checks what a presigned URL must carry
// (algorithm, credential, signature, and that it has not expired); it does not recompute the signature, so signing itself is proven only by the live
// bucket test (server/storage.s3.live.test.ts). Loopback only.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeS3 = { endpoint: string; bucket: string; objects: Map<string, { body: Buffer; type: string; modified: Date }>; clock: { now: () => number }; requests: Array<{ method: string; key: string; presigned: boolean; status: number }>;
  /** Lets `passes` more object reads through, then makes every later read wait until `release()` (to observe a job while it is in flight). */
  hold: (passes: number) => void; release: () => void; close: () => Promise<void> };

const readBody = (request: IncomingMessage) => new Promise<Buffer>((resolve, reject) => {
  const parts: Buffer[] = [];
  request.on("data", part => parts.push(part)).on("end", () => resolve(Buffer.concat(parts))).on("error", reject);
});

/** 20261022T101500Z → epoch ms */
const amzDate = (value: string) => Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8), +value.slice(9, 11), +value.slice(11, 13), +value.slice(13, 15));

export async function startFakeS3(bucket = "test-bucket"): Promise<FakeS3> {
  const objects: FakeS3["objects"] = new Map();
  const clock = { now: () => Date.now() };
  const requests: FakeS3["requests"] = [];
  let gate: { passes: number; open: Promise<void>; release: () => void } | null = null;
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fake");
    const [, bucketName, ...rest] = decodeURIComponent(url.pathname).split("/");
    const key = rest.join("/");
    const method = request.method ?? "GET";
    const presigned = url.searchParams.has("X-Amz-Signature");
    // the browser PUTs from the app's origin: allow it, and answer the preflight
    response.setHeader("Access-Control-Allow-Origin", "*"); response.setHeader("Access-Control-Allow-Methods", "PUT, GET, HEAD, DELETE, OPTIONS"); response.setHeader("Access-Control-Allow-Headers", "*"); response.setHeader("Access-Control-Expose-Headers", "ETag");
    if (method === "OPTIONS") { requests.push({ method, key, presigned, status: 204 }); response.writeHead(204); response.end(); return; }
    const finish = (status: number, body: Buffer | string = "", headers: Record<string, string | number> = {}) => {
      requests.push({ method, key, presigned, status });
      response.writeHead(status, headers);
      response.end(method === "HEAD" ? undefined : body);
    };
    const xml = (status: number, code: string) => finish(status, `<?xml version="1.0"?><Error><Code>${code}</Code></Error>`, { "Content-Type": "application/xml" });
    if (bucketName !== bucket) return xml(404, "NoSuchBucket");
    if (presigned) {
      const expires = Number(url.searchParams.get("X-Amz-Expires"));
      const issued = amzDate(url.searchParams.get("X-Amz-Date") ?? "");
      if (url.searchParams.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" || !url.searchParams.get("X-Amz-Credential") || !/^[0-9a-f]{64}$/.test(url.searchParams.get("X-Amz-Signature") ?? "")) return xml(403, "SignatureDoesNotMatch");
      if (!Number.isFinite(issued) || !Number.isFinite(expires) || clock.now() > issued + expires * 1000) return xml(403, "AccessDenied");
      if (Array.from(url.searchParams.keys()).some(name => name.toLowerCase().includes("checksum"))) return xml(400, "BadDigest"); // the defect a default SDK client produces
    }
    if (method === "PUT") {
      const body = await readBody(request);
      objects.set(key, { body, type: request.headers["content-type"] ?? "application/octet-stream", modified: new Date(clock.now()) });
      return finish(200, "", { ETag: '"fake"' });
    }
    if (method === "GET" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const contents = Array.from(objects).filter(([name]) => name.startsWith(prefix)).map(([name, object]) => `<Contents><Key>${name}</Key><LastModified>${object.modified.toISOString()}</LastModified><Size>${object.body.length}</Size></Contents>`).join("");
      return finish(200, `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`, { "Content-Type": "application/xml" });
    }
    const object = objects.get(key);
    if (method === "DELETE") { objects.delete(key); return finish(204); }
    if (method === "GET" || method === "HEAD") {
      if (!object) return xml(404, "NoSuchKey");
      if (method === "GET" && gate) { if (gate.passes > 0) gate.passes -= 1; else await gate.open; }
      return finish(200, object.body, { "Content-Type": object.type, "Content-Length": object.body.length, "Last-Modified": object.modified.toUTCString(), ETag: '"fake"' });
    }
    return xml(405, "MethodNotAllowed");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { endpoint: `http://127.0.0.1:${port}`, bucket, objects, clock, requests, hold: passes => { let release!: () => void; gate = { passes, open: new Promise<void>(resolve => { release = resolve; }), release }; },
    release: () => { gate?.release(); gate = null; },
    close: () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); }) };
}
