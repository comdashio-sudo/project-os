import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// D-33 (G-100): what client/public/sw.js does with each request, read from the file itself in a sandbox. The rule that matters: nothing under /api/
// (every company figure, list or file) and nothing of another origin is ever answered from or written to the worker's cache.
const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const listeners: Record<string, (event: unknown) => void> = {};
const self: Record<string, unknown> = { location: { origin: "https://app.example.test" }, addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; } };
runInNewContext(source, { self, URL, caches: {}, fetch: () => undefined, Response, Request: class {} });
const routeOf = self.dashioRouteOf as (request: { method: string; url: string; mode?: string }) => string;
const at = (path: string, extra: Partial<{ method: string; mode: string }> = {}) => routeOf({ method: "GET", url: `https://app.example.test${path}`, ...extra });

describe("the app-shell worker (D-33)", () => {
  it("keeps the page and the built files", () => {
    expect(at("/m/t/p", { mode: "navigate" })).toBe("page");
    expect(at("/assets/index-abc123.js")).toBe("file");
    expect(at("/fonts/naskh.woff2")).toBe("file");
    expect(at("/favicon.ico")).toBe("file");
  });

  it("NEGATIVE: never touches company data, other origins, writes, or files outside the kept kinds", () => {
    for (const path of ["/api/trpc/fieldEntry.context?input=%7B%7D", "/api/trpc/auth.me", "/healthz"]) expect(at(path)).toBe("network");
    expect(at("/api/trpc/x", { mode: "navigate" })).toBe("network");
    expect(routeOf({ method: "GET", url: "https://storage.example.test/bucket/photo.jpg" })).toBe("network");
    expect(at("/assets/index-abc123.js", { method: "POST" })).toBe("network");
    expect(at("/guide/cost-control-2.jpg")).toBe("network");
  });

  it("listens for install, activate, fetch, and the page's list of files", () => {
    expect(Object.keys(listeners).sort()).toEqual(["activate", "fetch", "install", "message"]);
  });
});
