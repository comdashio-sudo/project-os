// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { loadedFiles, registerShellCache } from "./shellCache";

// The worker is plain JS served as-is (client/public/sw.js): it is run here in a sandbox with a stand-in `self`, and its policy function read back.
const sandbox: Record<string, unknown> = { URL, module: { exports: {} }, self: { addEventListener: () => undefined, location: { origin: "https://dashio.example.test" } } };
vm.runInNewContext(readFileSync(path.resolve(import.meta.dirname, "../../public/sw.js"), "utf8"), sandbox);
const { routeOf } = (sandbox.module as { exports: { routeOf: (request: { method: string; url: string; mode?: string }, origin: string) => string } }).exports;
const O = "https://dashio.example.test";
const get = (url: string, mode = "cors") => ({ method: "GET", url, mode });

describe("D-33: what the shell worker keeps", () => {
  it("keeps the page (any route, as a navigation) and the build's own files", () => {
    expect(routeOf(get(`${O}/m/t1/p1`, "navigate"), O)).toBe("shell");
    expect(routeOf(get(`${O}/`, "navigate"), O)).toBe("shell");
    for (const file of ["/assets/index-abc123.js", "/assets/index-abc123.css", "/fonts/inter.woff2", "/brand/icon-192.png", "/favicon.ico", "/manifest.webmanifest"]) expect(routeOf(get(`${O}${file}`), O), file).toBe("static");
  });

  it("NEGATIVE: never keeps a company's data — no /api/ answer, not even a navigation to one, no write, no other site, not itself", () => {
    for (const url of [`${O}/api/trpc/fieldEntry.context?batch=1`, `${O}/api/trpc/auth.me`, `${O}/api/files/download?key=x`, `${O}/api`, `${O}/healthz`, `${O}/sw.js`]) expect(routeOf(get(url), O), url).toBe("never");
    expect(routeOf(get(`${O}/api/exports/report.pdf`, "navigate"), O)).toBe("never");
    expect(routeOf({ method: "POST", url: `${O}/assets/x.js` }, O)).toBe("never");
    expect(routeOf(get("https://cdn.other.example.test/assets/x.js"), O)).toBe("never");
    // a same-origin path that is neither the page nor a build file is left to the network
    expect(routeOf(get(`${O}/uploads/logo.png`), O)).toBe("never");
  });
});

describe("D-33: registration", () => {
  it("registers /sw.js and hands it the same-origin files this visit already loaded", async () => {
    const postMessage = vi.fn();
    const register = vi.fn(async () => undefined);
    const ok = await registerShellCache({ serviceWorker: { register, ready: Promise.resolve({ active: { postMessage } }) } }, O, () => [{ name: `${O}/assets/a.js` }, { name: "https://fonts.example.test/x.woff2" }, { name: `${O}/assets/a.js` }]);
    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(postMessage).toHaveBeenCalledWith({ type: "dashio-keep-files", urls: [`${O}/`, `${O}/assets/a.js`] });
  });

  it("NEGATIVE: no worker support or a refused registration leaves the app as it was", async () => {
    expect(await registerShellCache({}, O, () => [])).toBe(false);
    expect(await registerShellCache({ serviceWorker: { register: async () => { throw new Error("blocked"); }, ready: new Promise(() => undefined) } }, O, () => [])).toBe(false);
    expect(loadedFiles(O, [{ name: "https://elsewhere.example.test/a.js" }])).toEqual([`${O}/`]);
  });
});
