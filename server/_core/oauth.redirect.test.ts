import { describe, expect, it } from "vitest";
import { getSafeOAuthRedirect } from "./oauth";

function request(host = "project-os.example") {
  return {
    protocol: "https",
    get: (name: string) => name === "host" ? host : undefined,
  } as never;
}

describe("getSafeOAuthRedirect", () => {
  it("returns the original PMO path after a successful login", () => {
    expect(getSafeOAuthRedirect("https://project-os.example/pmo/tenant-a?view=attention", request())).toBe("/pmo/tenant-a?view=attention");
  });

  it("rejects an external redirect and returns the workspace root", () => {
    expect(getSafeOAuthRedirect("https://evil.example/steal", request())).toBe("/");
  });

  it("falls back safely for malformed or missing redirect state", () => {
    expect(getSafeOAuthRedirect("not a url", request())).toBe("/");
    expect(getSafeOAuthRedirect(undefined, request())).toBe("/");
  });
});
