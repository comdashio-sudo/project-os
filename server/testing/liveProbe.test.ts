import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { functionRegionOf } from "../../scripts/measure-live.mjs";

const root = path.resolve(import.meta.dirname, "../..");

describe("live probe", () => {
  it("reads the function region from x-vercel-id: edge::function::id means a function answered, edge::id means the edge did", () => {
    expect(functionRegionOf("fra1::sin1::9kd2m-1761350000000-abc")).toBe("sin1");
    expect(functionRegionOf("iad1::9kd2m-1761350000000-abc")).toBeNull();
    expect(functionRegionOf(null)).toBeNull();
    expect(functionRegionOf("")).toBeNull();
  });
  it("vercel.json asks for exactly one region, sin1, and the build writes the same one into the function's config", () => {
    const regions = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")).regions;
    expect(regions).toEqual(["sin1"]);
    expect(readFileSync(path.join(root, "scripts/build-vercel.mjs"), "utf8")).toMatch(/const REGION = "sin1"/);
  });
  it("the workflow is manual only, reads no secret and writes nothing", () => {
    const text = readFileSync(path.join(root, ".github/workflows/live-probe.yml"), "utf8");
    const onBlock = text.slice(text.indexOf("\non:"), text.indexOf("\npermissions:"));
    expect(onBlock.match(/^ {2}[a-z_]+:/gm)).toEqual(["  workflow_dispatch:"]);
    expect(text).not.toMatch(/secrets\./);
    expect(text).toMatch(/permissions:\s*\n\s*contents: read/);
  });
});
