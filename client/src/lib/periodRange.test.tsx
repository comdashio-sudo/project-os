import { describe, expect, it } from "vitest";
import { periodFor, weekStart } from "./periodRange";

describe("Q-72 (2): the periods start where the site's week and month start", () => {
  it("a week starts on Sunday", () => {
    expect(weekStart("2026-11-27")).toBe("2026-11-22"); // Friday → the Sunday before
    expect(weekStart("2026-11-22")).toBe("2026-11-22"); // a Sunday is its own start
    expect(weekStart("2026-11-28")).toBe("2026-11-22"); // Saturday
  });
  it("this week, last week (a full Sunday-to-Saturday), this month and last month", () => {
    expect(periodFor("thisWeek", "2026-11-27")).toEqual({ from: "2026-11-22", to: "2026-11-27" });
    expect(periodFor("lastWeek", "2026-11-27")).toEqual({ from: "2026-11-15", to: "2026-11-21" });
    expect(periodFor("thisMonth", "2026-11-27")).toEqual({ from: "2026-11-01", to: "2026-11-27" });
    expect(periodFor("lastMonth", "2026-11-27")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodFor("lastMonth", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
