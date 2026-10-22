import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, responseSecurityHeaders, storageConnectOrigin } from "./securityHeaders";

const connectSrc = (policy: string) => policy.split("; ").find(part => part.startsWith("connect-src "));

describe("connect-src carries what the browser uploads to", () => {
  it("by default allows this origin and the Supabase hosts, nothing else", () => {
    expect(connectSrc(CONTENT_SECURITY_POLICY)).toBe("connect-src 'self' https://*.supabase.co");
    expect(connectSrc(responseSecurityHeaders(true)["Content-Security-Policy"])).toBe("connect-src 'self' https://*.supabase.co");
  });

  it("adds the exact origin of the configured storage endpoint (a local S3 server in a rehearsal), and only its origin", () => {
    expect(storageConnectOrigin("http://127.0.0.1:9000/storage/v1/s3")).toBe("http://127.0.0.1:9000");
    expect(connectSrc(responseSecurityHeaders(true, "http://127.0.0.1:9000")["Content-Security-Policy"])).toBe("connect-src 'self' https://*.supabase.co http://127.0.0.1:9000");
  });

  it("ignores an endpoint that is missing, malformed or not http(s): no script-injectable value reaches the policy", () => {
    for (const bad of [undefined, "", "not a url", "javascript:alert(1)", "data:text/html,x", "ftp://files.example.test"]) expect(storageConnectOrigin(bad), String(bad)).toBeNull();
    expect(storageConnectOrigin("https://abc.supabase.co/storage/v1/s3?x=1#y")).toBe("https://abc.supabase.co");
  });

  it("sends no policy at all in development (hot reload needs inline scripts)", () => {
    expect(responseSecurityHeaders(false, "http://127.0.0.1:9000")["Content-Security-Policy"]).toBeUndefined();
  });
});
