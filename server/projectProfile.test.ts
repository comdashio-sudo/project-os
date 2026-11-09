import { describe, expect, it } from "vitest";
import { logoKind, profileIssue, svgIsUnsafe } from "./projectProfile";
import { CLEAN_SVG, UNSAFE_SVGS } from "./testing/svgSamples";

// D-42 (a): the rules said in code before the database's CHECKs, and the logo's content checks (the database test covers them through the router).
const ok = { workDays: [0, 1, 2, 3, 4], workStart: "07:00", workEnd: "17:00", reportPrefix: "PRJ-1" };

describe("project profile rules", () => {
  it("accepts a normal week, no hours at all, and no prefix", () => {
    expect(profileIssue(ok)).toBeNull();
    expect(profileIssue({ ...ok, workStart: null, workEnd: null, reportPrefix: null })).toBeNull();
  });
  it.each([
    [{ workDays: [] }, "WORK_DAYS_INVALID"], [{ workDays: [7] }, "WORK_DAYS_INVALID"], [{ workDays: [1, 1] }, "WORK_DAYS_INVALID"],
    [{ workStart: "17:00", workEnd: "07:00" }, "WORK_HOURS_REVERSED"], [{ workStart: "07:00", workEnd: "07:00" }, "WORK_HOURS_REVERSED"],
    [{ workEnd: null }, "WORK_HOURS_INCOMPLETE"], [{ workStart: "7:00" }, "WORK_HOURS_INVALID"], [{ workEnd: "24:00" }, "WORK_HOURS_INVALID"],
    [{ reportPrefix: "abc" }, "REPORT_PREFIX_INVALID"], [{ reportPrefix: "-AB" }, "REPORT_PREFIX_INVALID"], [{ reportPrefix: "A".repeat(17) }, "REPORT_PREFIX_INVALID"],
  ])("refuses %j", (change, issue) => expect(profileIssue({ ...ok, ...change })).toBe(issue));
});

describe("logo content", () => {
  it.each(UNSAFE_SVGS)("refuses %s", (_name, svg) => expect(svgIsUnsafe(svg)).toBe(true));
  it("accepts a plain logo (gradient, xlink:href to a local id, xml:space, text) and knows it as an SVG", () => {
    expect(svgIsUnsafe(CLEAN_SVG)).toBe(false);
    expect(logoKind(Buffer.from(CLEAN_SVG))).toBe("svg");
  });
  it("still knows a DOCTYPE'd file as an SVG, so it is refused as unsafe rather than as an unknown type", () => {
    for (const [, svg] of UNSAFE_SVGS.filter(([name]) => name.includes("DOCTYPE"))) expect(logoKind(Buffer.from(svg))).toBe("svg");
  });
  it("knows PNG, JPEG and SVG by their bytes, and nothing else", () => {
    expect(logoKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(logoKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(logoKind(Buffer.from('﻿<?xml version="1.0"?>\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    // a DOCTYPE with an internal subset is still an SVG (so its entity declaration is refused as unsafe, not as an unknown type)
    expect(logoKind(Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    expect(logoKind(Buffer.from("GIF89a"))).toBeNull();
    expect(logoKind(Buffer.from("<html><svg></svg></html>"))).toBeNull();
  });
  it("refuses an SVG with script, an event handler, a javascript: link or embedded HTML; a plain SVG passes", () => {
    expect(svgIsUnsafe('<svg><rect width="1" height="1" fill="#000"/></svg>')).toBe(false);
    for (const bad of ["<svg><script>x()</script></svg>", '<svg onload="x()"></svg>', '<svg><a href="javascript:x()">a</a></svg>', "<svg><foreignObject><div/></foreignObject></svg>", '<svg><iframe src="x"/></svg>']) expect(svgIsUnsafe(bad)).toBe(true);
  });
;
});
