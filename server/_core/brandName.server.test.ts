// I3 (the six defects), review of #536 by B: the product is Dashio on what the server itself shows too — the error pages it renders and the integration API
// document it publishes. «PROJECT OS» survives only in identifiers (PROJECT_OS_… error codes, the X-ProjectOS-Signature header other systems already verify),
// comments, backup-file internals and the repository's own documents.
import { describe, expect, it } from "vitest";
import { errorPageHtml, type ErrorPageKind } from "./errorPages";
import { openApiDocument } from "../integrations/api";

describe("the product's name on what the server shows", () => {
  it("every error page is titled Dashio and never says «PROJECT OS»", () => {
    for (const kind of ["server", "unavailable", "bad_request", "too_large", "not_found"] as ErrorPageKind[]) {
      const html = errorPageHtml(kind, "req-1");
      expect(html, kind).not.toMatch(/PROJECT\s*OS/i);
      expect(html, kind).toMatch(/<title>[^<]*Dashio<\/title>/);
    }
  });
  it("the integration API document published to other systems is titled Dashio", () => {
    const document = openApiDocument();
    expect(document.info.title).toBe("Dashio integration API");
    expect(JSON.stringify(document.info)).not.toMatch(/PROJECT OS/i);
  });
});
