// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectUploadContext, SectionActions } from "./SectionActions";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
afterEach(() => cleanup());

describe("SectionActions (work order 21: + Add and Upload file on every section)", () => {
  it("+ Add takes the focus to the first field of the section's own form; Upload file is the page's upload", () => {
    const upload = vi.fn();
    render(<ProjectUploadContext.Provider value={upload}><section aria-label="Contracts"><SectionActions /><form><input aria-label="Contract number" /></form></section></ProjectUploadContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Contract number"));
    fireEvent.click(screen.getByRole("button", { name: "Upload file" }));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("does not offer + Add where the section has no form (a read-only role), and keeps Upload file", () => {
    render(<ProjectUploadContext.Provider value={vi.fn()}><section aria-label="Contracts"><SectionActions /><p>You can only read this register.</p></section></ProjectUploadContext.Provider>);
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.getByRole("button", { name: "Upload file" })).toBeTruthy();
  });

  it("finds a form that arrives after the buttons (permissions and data load later)", async () => {
    const Late = () => { const [ready, setReady] = React.useState(false); React.useEffect(() => { setTimeout(() => setReady(true), 0); }, []); return ready ? <form><input aria-label="Amount" /></form> : null; };
    render(<section aria-label="Budget"><SectionActions /><Late /></section>);
    expect(await screen.findByRole("button", { name: "Add" })).toBeTruthy();
  });
});
