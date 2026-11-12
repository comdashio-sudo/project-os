// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Badge, Breadcrumbs, Button, DataTable, DirectionProvider, EmptyState, Field, FileDropzone, PageIntro, Segmented, Select, SkeletonRows, Stepper, TextInput, formatAmount, formatBytes, formatDate, formatShortDate, formatWeekday, TableScroll, formatNumber, formatPercent, INTRO_MAX_CHARS } from "./index";

// The shared component library: states, accessibility wiring, translated text, Western digits. Everything renders inside the same providers a screen has.
beforeAll(() => {
  // Radix Select and Dialog use pointer and scroll APIs jsdom lacks
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
const inApp = (ui: React.ReactElement, lang = "en") => { window.history.replaceState({}, "", `/?lang=${lang}`); return render(<LanguageProvider><DirectionProvider direction="a">{ui}</DirectionProvider></LanguageProvider>); };

describe("Button", () => {
  it("has four variants and the loading and disabled states", () => {
    inApp(<><Button>Save</Button><Button variant="secondary">B</Button><Button variant="ghost">C</Button><Button variant="danger">D</Button></>);
    expect(["primary", "secondary", "ghost", "danger"].every(variant => document.querySelector(`[data-variant="${variant}"]`))).toBe(true);
  });
  it("loading keeps the label, disables the click, announces busy and does not fire", async () => {
    const onClick = vi.fn();
    inApp(<Button loading onClick={onClick}>Saving</Button>);
    const button = screen.getByRole("button", { name: /Saving/ });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("a disabled button does not fire", async () => {
    const onClick = vi.fn(); inApp(<Button disabled onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" })); expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Field", () => {
  it("ties label, hint and error to the control, and puts the error beside it as an alert", () => {
    inApp(<Field label="Project code" hint="Letters and digits." error="Already used." required>{props => <TextInput {...props} />}</Field>);
    const input = screen.getByLabelText(/Project code/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Letters and digits.", "Already used."]);
    expect(screen.getByRole("alert").textContent).toBe("Already used.");
  });
  it("no error means no alert and no aria-invalid", () => {
    inApp(<Field label="Name">{props => <TextInput {...props} />}</Field>);
    expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBeNull();
  });
  it("a text input refuses type=file: the dropzone is the one place for a file", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => inApp(<TextInput type="file" />)).toThrow(/FileDropzone/);
    quiet.mockRestore();
  });
});

describe("Select (custom list, not the browser's)", () => {
  it("opens a listbox, chooses with the keyboard, and never puts a native select in the page", async () => {
    const onChange = vi.fn();
    inApp(<Select aria-label="Type" value="a" onValueChange={onChange} options={[{ value: "a", label: "Residential" }, { value: "b", label: "Commercial" }]} />);
    expect(document.querySelector("select")).toBeNull();
    const trigger = screen.getByRole("combobox", { name: "Type" });
    expect(trigger.textContent).toContain("Residential");
    await act(async () => { fireEvent.keyDown(trigger, { key: "ArrowDown" }); });
    const option = await screen.findByRole("option", { name: "Commercial" });
    await act(async () => { fireEvent.click(option); });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("inside a required Field the list says so to a screen reader (aria-required on its combobox)", () => {
    inApp(<Field label="Plan" required>{props => <Select id={props.id} aria-describedby={props["aria-describedby"]} aria-required={props["aria-required"]} onValueChange={vi.fn()} options={[{ value: "a", label: "A" }]} />}</Field>);
    expect(screen.getByRole("combobox").getAttribute("aria-required")).toBe("true");
  });
});

describe("FileDropzone", () => {
  const take = (input: HTMLInputElement, files: File[]) => fireEvent.change(input, { target: { files } });
  const hiddenInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  it("says what to do in the language of the screen and never shows the browser's 'Choose File'", () => {
    for (const [lang, text] of [["en", "Drag the file here"], ["ar", "اسحب الملف"], ["ur", "فائل یہاں"]] as const) {
      inApp(<FileDropzone accept={[".xer"]} maxBytes={1024} items={[]} onFiles={() => undefined} />, lang);
      expect(document.body.textContent).toContain(text);
      expect(document.body.textContent).not.toMatch(/choose file|no file chosen/i);
      cleanup();
    }
  });
  it("the one file input is hidden from the eye and from assistive technology; a translated button opens it", async () => {
    inApp(<FileDropzone accept={[".xer"]} maxBytes={1024} items={[]} onFiles={() => undefined} />);
    expect(hiddenInput().className).toContain("sr-only"); expect(hiddenInput().getAttribute("aria-hidden")).toBe("true");
    const click = vi.spyOn(hiddenInput(), "click");
    await userEvent.click(screen.getByRole("button", { name: "Choose a file" })); expect(click).toHaveBeenCalled();
  });
  it("accepts a file of the right type and size and hands it on", () => {
    const onFiles = vi.fn(); inApp(<FileDropzone accept={[".xer"]} maxBytes={1024} items={[]} onFiles={onFiles} />);
    take(hiddenInput(), [new File(["x"], "plan.XER")]); expect(onFiles).toHaveBeenCalledTimes(1);
  });
  it("NEGATIVE: the wrong type and the too-big file are refused before anything is sent, with the reason beside the area", () => {
    const onFiles = vi.fn(); inApp(<FileDropzone accept={[".xer"]} maxBytes={1024} items={[]} onFiles={onFiles} />);
    take(hiddenInput(), [new File(["x"], "plan.pdf")]);
    expect(screen.getByRole("alert").textContent).toMatch(/not supported: plan\.pdf/);
    take(hiddenInput(), [new File([new Uint8Array(4096)], "big.xer")]);
    expect(screen.getByRole("alert").textContent).toMatch(/larger than the limit: big\.xer \(4 KB \/ 1 KB\)/);
    expect(onFiles).not.toHaveBeenCalled();
  });
  it("drag and drop works, and shows the active state while the file is over", () => {
    const onFiles = vi.fn(); inApp(<FileDropzone accept={[".csv"]} maxBytes={1024} items={[]} onFiles={onFiles} />);
    const zone = document.querySelector("[data-dropzone]") as HTMLElement;
    fireEvent.dragOver(zone); expect(zone.getAttribute("data-over")).toBe("true"); expect(zone.textContent).toContain("Drop the file now");
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a,b"], "rows.csv")] } }); expect(onFiles).toHaveBeenCalled(); expect(zone.getAttribute("data-over")).toBeNull();
  });
  it("shows a real progress bar for a file that is uploading, with Western digits", () => {
    inApp(<FileDropzone accept={[".xer"]} maxBytes={50 * 1024 * 1024} items={[{ id: "1", name: "a.xer", size: 12_400_000, status: "uploading", progress: 62 }]} onFiles={() => undefined} onRemove={() => undefined} />, "ar");
    const bar = screen.getByRole("progressbar"); expect(bar.getAttribute("aria-valuenow")).toBe("62");
    expect(document.body.textContent).toContain("62%"); expect(document.body.textContent).toContain("11.8 MB");
  });
});

describe("Stepper, PageIntro, DataTable, Breadcrumbs, Badge, empty and loading", () => {
  it("the stepper marks the current step and says 'Step 2 of 4' for a phone", () => {
    inApp(<Stepper label="Setup" current={1} steps={["A", "B", "C", "D"].map(label => ({ id: label, label }))} />);
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("B"); expect(document.body.textContent).toContain("Step 2 of 4");
  });
  it("PageIntro is one line plus 'Learn more'; a long summary is refused; details fold away", () => {
    inApp(<PageIntro title="T" summary="One line." details="The long part." />);
    expect(document.querySelector("[data-intro]")?.textContent).toBe("One line.");
    const details = document.querySelector("details[data-learn-more]") as HTMLDetailsElement; expect(details.open).toBe(false); expect(within(details).getByText("Learn more")).toBeTruthy();
    cleanup();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => inApp(<PageIntro title="T" summary={"x".repeat(INTRO_MAX_CHARS + 1)} />)).toThrow(/limit 120/);
    quiet.mockRestore();
  });
  it("the table has a caption, scoped headers and tabular numbers", () => {
    inApp(<DataTable caption="Rows" rowKey={row => String(row.id)} rows={[{ id: 1, n: 1234.5 }]} columns={[{ key: "n", header: "N", numeric: true, render: row => formatNumber(Number(row.n), 2) }]} />);
    expect(screen.getByRole("region", { name: "Rows" })).toBeTruthy(); expect(screen.getByRole("columnheader", { name: "N" }).getAttribute("scope")).toBe("col"); expect(screen.getByText("1,234.50").className).toContain("tabular-nums");
  });
  it("an empty table says so", () => { inApp(<DataTable caption="R" rowKey={() => "x"} rows={[]} columns={[{ key: "a", header: "A" }]} />); expect(screen.getByText("No rows")).toBeTruthy(); });
  it("breadcrumbs: the last item is the page; separators mirror in right-to-left", () => {
    inApp(<Breadcrumbs items={[{ label: "Home", href: "#" }, { label: "Here" }]} />, "ar");
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("Here"); expect(document.querySelector("svg.rtl\\:rotate-180")).toBeTruthy();
  });
  it("a badge always carries its words; empty and skeleton states announce themselves", () => {
    inApp(<><Badge tone="danger">Late</Badge><EmptyState title="Nothing yet" line="Create one." /><SkeletonRows rows={2} /></>);
    expect(screen.getByText("Late")).toBeTruthy(); expect(screen.getByText("Nothing yet")).toBeTruthy(); expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeTruthy();
  });
  it("the segmented control is a radio group the keyboard can move", async () => {
    const onChange = vi.fn(); inApp(<Segmented label="Source" value="a" onValueChange={onChange} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "A" }), { key: "ArrowRight" }); expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("format: Western digits and a dot, in every language", () => {
  it("numbers, percentages and sizes", () => {
    expect(formatNumber(1234567.891, 2)).toBe("1,234,567.89"); expect(formatPercent(62)).toBe("62.00%"); expect(formatPercent(0.1234, 4)).toBe("0.1234%");
    expect(formatBytes(512)).toBe("512 B"); expect(formatBytes(1536)).toBe("1.5 KB"); expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });
  it("dates in Arabic, English and Urdu use 0-9 only", () => {
    for (const language of ["ar", "en", "ur"] as const) expect(formatDate("2026-10-25T00:00:00Z", language), language).not.toMatch(/[٠-٩۰-۹]/);
    expect(formatDate("2026-10-25T00:00:00Z", "ar")).toMatch(/25/);
  });
});

describe("formatAmount and formatShortDate", () => {
  it("formatAmount groups, keeps at most the given decimals and pads none", () => {
    expect(formatAmount(71740953.269)).toBe("71,740,953.27"); expect(formatAmount(1200)).toBe("1,200"); expect(formatAmount(-57446.81)).toBe("-57,446.81"); expect(formatAmount(40.1234, 3)).toBe("40.123");
  });
  it("formatShortDate is day/month/year in Western digits and the Gregorian calendar in every language", () => {
    const day = new Date("2026-10-24T00:00:00.000Z");
    for (const language of ["ar", "en", "ur"] as const) {
      const shown = formatShortDate(day, language);
      expect(shown).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]|هـ/);
      expect(shown.replace(/[^0-9/]/g, "")).toBe("24/10/2026");
    }
  });
});

describe("TableScroll", () => {
  it("is a named, focusable frame that says it scrolls only when the table is wider than it", () => {
    const widths = { scrollWidth: 0, clientWidth: 0 };
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => widths.scrollWidth);
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => widths.clientWidth);
    widths.scrollWidth = 640; widths.clientWidth = 358;
    inApp(<TableScroll label="Projects"><table><tbody><tr><th>A</th><td>-57,446.81 SAR</td></tr></tbody></table></TableScroll>);
    const frame = screen.getByRole("region", { name: "Projects" });
    expect(frame.getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("Swipe the table sideways to see every column")).toBeTruthy();
    cleanup();
    widths.scrollWidth = 600; widths.clientWidth = 600;
    inApp(<TableScroll label="Projects"><table><tbody><tr><td>1</td></tr></tbody></table></TableScroll>);
    expect(screen.queryByText("Swipe the table sideways to see every column")).toBeNull();
    scroll.mockRestore(); client.mockRestore();
  });
});

describe("formatWeekday", () => {
  it("names the day in Western digits' locales, and gives a dash for an empty or impossible day instead of throwing", () => {
    expect(formatWeekday("2026-11-09", "en")).toBe("Monday");
    expect(formatWeekday("2026-11-09", "ar")).toBe("الاثنين");
    for (const value of ["", "2026-11", "2026-02-30x", "not a date", "2026-13-45"]) expect(formatWeekday(value, "en")).toBe("—");
  });
});
