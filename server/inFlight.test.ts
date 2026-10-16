import { describe, expect, it } from "vitest";
import { createInFlight } from "./inFlight";

const gate = () => { let open!: (value: string) => void; let fail!: (error: Error) => void; const promise = new Promise<string>((resolve, reject) => { open = resolve; fail = reject; }); return { promise, open, fail }; };

describe("in-flight sharing", () => {
  it("runs the work once for simultaneous callers with the same key", async () => {
    const flight = createInFlight<string>(); let runs = 0; const g = gate();
    const work = () => { runs++; return g.promise; };
    const calls = [flight.run("a", work), flight.run("a", work), flight.run("a", work)];
    g.open("done");
    expect(await Promise.all(calls)).toEqual(["done", "done", "done"]);
    expect(runs).toBe(1);
  });

  it("never serves an earlier answer to a later call: the entry is gone once the work settles", async () => {
    const flight = createInFlight<number>(); let runs = 0;
    const work = async () => ++runs;
    expect(await flight.run("a", work)).toBe(1);
    expect(flight.pending()).toBe(0);
    expect(await flight.run("a", work)).toBe(2);
  });

  it("keeps different keys apart (another person or another company never shares a run)", async () => {
    const flight = createInFlight<string>(); const first = gate(); const second = gate();
    const a = flight.run("user1:tenantA", () => first.promise);
    const b = flight.run("user2:tenantA", () => second.promise);
    first.open("one"); second.open("two");
    expect([await a, await b]).toEqual(["one", "two"]);
  });

  it("a failure reaches every sharer and clears the entry so the next call retries", async () => {
    const flight = createInFlight<string>(); let runs = 0; const g = gate();
    const work = () => { runs++; return runs === 1 ? g.promise : Promise.resolve("recovered"); };
    const calls = [flight.run("a", work), flight.run("a", work)];
    g.fail(new Error("boom"));
    await expect(calls[0]).rejects.toThrow("boom");
    await expect(calls[1]).rejects.toThrow("boom");
    expect(flight.pending()).toBe(0);
    expect(await flight.run("a", work)).toBe("recovered");
    expect(runs).toBe(2);
  });
});
