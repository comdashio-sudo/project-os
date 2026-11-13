/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Q-18 (the owner: «green boxes on a white screen while the page loads»). The browser measurement is tests/ui/loadingFrames.mjs (frames every 250 ms on
// Fast 3G); this is the check that runs on every pull request and fails the build if what caused it comes back:
//   1. the page before any script: index.html paints the platform's background and the frame's shape in grey, from an inline style, and holds no
//      render-blocking third-party stylesheet in its head;
//   2. the loading placeholders are grey (the line colour), never the accent (the brand aqua was what showed as green boxes);
//   3. the first download is the frame and one page: every page but home, sign-in and not-found is fetched when it is opened.
const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const css = read("src", "index.css");
const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1].toUpperCase();

export function firstPaintProblems(html: string): string[] {
  const problems: string[] = [];
  const head = html.slice(0, html.indexOf("</head>"));
  const style = /<style>([\s\S]*?)<\/style>/.exec(head)?.[1] ?? "";
  const bodyBackground = /html,\s*body\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/.exec(style)?.[1]?.toUpperCase();
  if (!bodyBackground) problems.push("no inline background for html/body: the page is white until the stylesheet arrives");
  else if (bodyBackground !== token("--dashio-paper")) problems.push(`inline background ${bodyBackground} is not the page background token ${token("--dashio-paper")}`);
  if (/<link[^>]+rel="stylesheet"[^>]+fonts\.googleapis\.com|<link[^>]+fonts\.googleapis\.com[^>]+rel="stylesheet"/.test(head)) problems.push("a render-blocking font stylesheet from another host in <head>");
  const rootContent = /<div id="root">([\s\S]*?)<\/div>\s*<script/.exec(html)?.[1] ?? "";
  if (!/class="boot"/.test(rootContent)) problems.push("#root is empty before the script runs: nothing is drawn until the app mounts");
  for (const colour of Array.from(style.matchAll(/#[0-9a-fA-F]{6}/g), match => match[0].toUpperCase()))
    if ([token("--dashio-aqua"), token("--dashio-aqua-deep")].includes(colour)) problems.push(`the first paint uses the accent ${colour}`);
  return problems;
}

describe("first paint (Q-18)", () => {
  const html = read("index.html");

  it("index.html paints the background and the frame's grey shape inline, before any script, with no blocking font stylesheet", () => {
    expect(firstPaintProblems(html)).toEqual([]);
    expect(html).toContain(token("--dashio-line")); // the placeholders are drawn in the line colour, the same as the app's skeleton
  });

  it("NEGATIVE: the page as it was (empty root, no inline style, the font stylesheet in the head) is named on every count", () => {
    const old = `<html><head><link href="https://fonts.googleapis.com/css2?family=X&display=swap" rel="stylesheet" /></head><body><div id="root"></div>\n<script type="module" src="/src/main.tsx"></script></body></html>`;
    expect(firstPaintProblems(old)).toEqual([
      "no inline background for html/body: the page is white until the stylesheet arrives",
      "a render-blocking font stylesheet from another host in <head>",
      "#root is empty before the script runs: nothing is drawn until the app mounts",
    ]);
    expect(firstPaintProblems(html.replace(`background: ${token("--dashio-paper")}`, "background: #2ED3C6"))).toContain(`inline background #2ED3C6 is not the page background token ${token("--dashio-paper")}`);
  });

  it("the loading placeholders are grey, never the accent (the green boxes)", () => {
    for (const file of [["src", "components", "ui", "skeleton.tsx"], ["src", "components", "ShellSkeleton.tsx"], ["src", "components", "DashboardLayoutSkeleton.tsx"]]) {
      const source = read(...file);
      expect(source, file.join("/")).not.toMatch(/\bbg-accent\b|dashio-aqua/);
    }
    expect(read("src", "components", "ui", "skeleton.tsx")).toContain("bg-[var(--dashio-line)]");
    expect(read("src", "components", "ShellSkeleton.tsx")).toContain("bg-[var(--dashio-line)]");
  });

  it("the first download is the frame and one page: only home, sign-in and not-found are imported up front", () => {
    const app = read("src", "App.tsx");
    const eager = Array.from(app.matchAll(/^import (\w+) from "\.\/pages\/[\w/]+";$/gm), match => match[1]);
    expect(eager.sort()).toEqual(["Home", "Login", "NotFound"]);
    expect((app.match(/lazyPage\(lazy\(\(\) => import\("\.\/pages\//g) ?? []).length).toBeGreaterThanOrEqual(40);
  });
});
