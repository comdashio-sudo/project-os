import { describe, expect, it } from "vitest";
import { isChunkLoadError, reloadOnceForNewRelease } from "./chunkReload";

// Q-56 (7): which failures are «the page's code file is gone», and the one-reload-a-minute guard.
const memory = () => { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } }; };

describe("isChunkLoadError", () => {
  it("knows the browsers' words for a code file that could not be fetched", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/A-1.js"))).toBe(true); // Chrome
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true); // Firefox
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true); // Safari
    expect(isChunkLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true);
  });
  it("NEGATIVE: an ordinary render error is not one", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
  });
});

describe("reloadOnceForNewRelease", () => {
  it("reloads once, then not again within the minute, then again after it", () => {
    const store = memory(); let reloads = 0; const reload = () => { reloads += 1; };
    expect(reloadOnceForNewRelease({ now: 1_000, store, reload })).toBe(true);
    expect(reloadOnceForNewRelease({ now: 30_000, store, reload })).toBe(false);
    expect(reloadOnceForNewRelease({ now: 62_000, store, reload })).toBe(true);
    expect(reloads).toBe(2);
  });
  it("NEGATIVE: without storage there is no guard, so it never reloads (a loop is worse than the error screen)", () => {
    let reloads = 0;
    expect(reloadOnceForNewRelease({ now: 1, store: null, reload: () => { reloads += 1; } })).toBe(false);
    expect(reloads).toBe(0);
  });
});
