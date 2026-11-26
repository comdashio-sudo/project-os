// I3 (the six defects): the product is Dashio. «PROJECT OS» was its working name and is retired from every screen; it survives only in code identifiers
// (PROJECT_OS_… error codes), comments and the repository's own documents. This reads every page and component and fails if the old name is shown again.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
});

describe("the product's name on screen", () => {
  it("no page or component shows «PROJECT OS» (the retired name); Dashio is the name", () => {
    const shown = walk(join(__dirname, "..")).flatMap(file => readFileSync(file, "utf8").split("\n").map((line, index) => ({ file, line: index + 1, text: line })))
      // a comment line is not shown; an identifier (PROJECT_OS_…) has an underscore
      .filter(({ text }) => /PROJECT OS/i.test(text) && !/^\s*(\/\/|\*|\/\*)/.test(text))
      .map(({ file, line }) => `${file.split("client/src/")[1]}:${line}`);
    expect(shown).toEqual([]);
  });
});
