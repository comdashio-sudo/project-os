// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CheckedForm } from "@/components/CheckedForm";
import { Badge, Breadcrumbs, Button, FileButton, DataTable, DirectionProvider, EmptyState, Field, FileDropzone, PageIntro, Segmented, Select, SkeletonRows, Stepper, TextInput, formatAmount, formatBytes, formatDate, formatShortDate, formatDateTime, formatWeekday, TableScroll, formatNumber, formatPercent, INTRO_MAX_CHARS } from "./index";

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

// D-76: the three notes from the review of #222
describe("TableScroll (D-76)", () => {
  const sizes = () => {
    const widths = { scrollWidth: 300, clientWidth: 300 };
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => widths.scrollWidth);
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => widths.clientWidth);
    return { widths, restore: () => { scroll.mockRestore(); client.mockRestore(); } };
  };
  it("(a) notices a table that grows after it was drawn (rows arriving later), and says it scrolls", async () => {
    const { widths, restore } = sizes();
    const observed: Element[] = []; const callbacks: Array<() => void> = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(callback: () => void) { callbacks.push(callback); } observe(target: Element) { observed.push(target); } unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    try {
      const Grows = ({ rows }: { rows: number }) => <TableScroll label="Units"><table><tbody>{Array.from({ length: rows }, (_, i) => <tr key={i}><td>{i}</td></tr>)}</tbody></table></TableScroll>;
      const view = inApp(<Grows rows={0} />);
      expect(screen.getByRole("region", { name: "Units" }).closest("[data-table-scroll]")!.getAttribute("data-table-scroll")).toBe("fits");
      const table = view.container.querySelector("table")!;
      expect(observed).toContain(table); // the content is watched, not only the frame
      widths.scrollWidth = 900; // the rows came in and the table is now wider than its frame
      view.rerender(<LanguageProvider><DirectionProvider direction="a"><Grows rows={40} /></DirectionProvider></LanguageProvider>);
      await act(async () => { callbacks.forEach(callback => callback()); });
      expect(screen.getByRole("region", { name: "Units" }).closest("[data-table-scroll]")!.getAttribute("data-table-scroll")).toBe("overflows");
    } finally {
      globalThis.ResizeObserver = original; restore();
    }
  });
  it("(b) the edge fade covers the table's frame only, never the hint line under it", () => {
    const { widths, restore } = sizes();
    widths.scrollWidth = 900;
    inApp(<TableScroll label="Units"><table><tbody><tr><td>1</td></tr></tbody></table></TableScroll>);
    const fade = document.querySelector("[data-table-fade]")!;
    const hint = screen.getByText("Swipe the table sideways to see every column");
    expect(fade.parentElement!.contains(hint)).toBe(false);
    expect(fade.parentElement!.contains(screen.getByRole("region", { name: "Units" }))).toBe(true);
    restore();
  });
  it("(c) is a keyboard stop only while there is something to scroll", () => {
    const { widths, restore } = sizes();
    inApp(<TableScroll label="Units"><table><tbody><tr><td>1</td></tr></tbody></table></TableScroll>);
    expect(screen.getByRole("region", { name: "Units" }).hasAttribute("tabindex")).toBe(false);
    cleanup();
    widths.scrollWidth = 900;
    inApp(<TableScroll label="Units"><table><tbody><tr><td>1</td></tr></tbody></table></TableScroll>);
    expect(screen.getByRole("region", { name: "Units" }).getAttribute("tabindex")).toBe("0");
    restore();
  });
});

describe("formatWeekday", () => {
  it("names the day in Western digits' locales, and gives a dash for an empty or impossible day instead of throwing", () => {
    expect(formatWeekday("2026-11-09", "en")).toBe("Monday");
    expect(formatWeekday("2026-11-09", "ar")).toBe("الاثنين");
    for (const value of ["", "2026-11", "2026-02-30x", "not a date", "2026-13-45"]) expect(formatWeekday(value, "en")).toBe("—");
  });
});

describe("D-75: formatDateTime — a moment, in the language's month names, Western digits only", () => {
  it("writes the date and the time with digits 0-9 in all three languages", () => {
    const moment = new Date(2026, 9, 25, 9, 5);
    for (const language of ["ar", "en", "ur"] as const) {
      const text = formatDateTime(moment, language);
      expect(text, language).toMatch(/2026/);
      expect(text, language).toMatch(/09:05/);
      expect(text, language).not.toMatch(/[٠-٩۰-۹]/);
    }
    expect(formatDateTime(moment, "en")).toMatch(/Oct/);
  });
  it("accepts the ISO string the server sends", () => {
    expect(formatDateTime("2026-10-25T09:05:00", "en")).toBe(formatDateTime(new Date(2026, 9, 25, 9, 5), "en"));
  });
});

describe("D-75: a required ds list stops a checked form like a typed field", () => {
  const form = (value: string | undefined, onSubmit: () => void) => (
    <LanguageProvider><CheckedForm onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="pick-role">Role</label>
      <Select id="pick-role" required value={value} onValueChange={() => undefined} options={[{ value: "r1", label: "Site engineer" }]} />
      <button type="submit">Send</button>
    </CheckedForm></LanguageProvider>
  );
  it("empty: nothing is sent, and the message sits under the list, which is marked required", () => {
    const sent = vi.fn();
    const { container } = render(form(undefined, sent));
    expect(screen.getByRole("combobox").getAttribute("aria-required")).toBe("true");
    const copy = container.querySelector<HTMLInputElement>("input[data-list-for='pick-role']")!;
    expect(copy.required).toBe(true);
    expect(copy.tabIndex).toBe(-1);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sent).not.toHaveBeenCalled();
    expect(container.querySelector("[data-checked-error]")).not.toBeNull();
  });
  it("chosen: the copy carries the value and the form is sent", () => {
    const sent = vi.fn();
    const { container } = render(form("r1", sent));
    expect(container.querySelector<HTMLInputElement>("input[data-list-for='pick-role']")!.value).toBe("r1");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sent).toHaveBeenCalledTimes(1);
  });
});

describe("D-75: FileButton — the compact file control", () => {
  it("one translated button holds the hidden input; choosing hands the file over and names it; nothing chosen is said in the language", async () => {
    const chosen = vi.fn();
    render(<LanguageProvider><FileButton label="Upload the plan" accept="image/png" onFile={chosen} /></LanguageProvider>);
    const input = screen.getByLabelText("Upload the plan") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.className).toContain("sr-only");
    expect(document.querySelector("[data-file-button]")!.textContent).toContain("Upload the plan");
    const file = new File(["x"], "plan.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(chosen).toHaveBeenCalledWith(file);
    expect(screen.getByText("plan.png")).toBeTruthy();
  });
  it("disabled: the input refuses and nothing is handed over", async () => {
    const chosen = vi.fn();
    render(<LanguageProvider><FileButton label="Upload" accept="image/png" disabled onFile={chosen} /></LanguageProvider>);
    const input = screen.getByLabelText("Upload") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    await userEvent.upload(input, new File(["x"], "a.png", { type: "image/png" }));
    expect(chosen).not.toHaveBeenCalled();
  });
});
