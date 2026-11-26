import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Q-68: the page sweep pressed «calculate the EVM figures» and the server answered 500 for a figure its own rules refuse (EV above BAC, a zero CPI under a method that divides by it).
// That is the person's input to correct: a BAD_REQUEST with a reason they can read, never an internal error.
const caller = appRouter.createCaller({ user: { id: 1, openId: "evm-user", name: "EVM user", email: "evm@example.test", loginMethod: "email", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const refusal = async (input: Parameters<typeof caller.controls.calculateEvm>[0]) => caller.controls.calculateEvm(input).then(() => null, (error: { code?: string; message?: string }) => ({ code: error.code, message: error.message }));

describe("Q-68: the EVM calculator refuses a figure the rules refuse as a BAD_REQUEST with its reason", () => {
  it("EV above BAC, a zero CPI and a zero SPI each answer BAD_REQUEST with a named reason", async () => {
    expect(await refusal({ pv: 10, ev: 101, ac: 50, bac: 100, eacMethod: "ac_plus_remaining" })).toEqual({ code: "BAD_REQUEST", message: "PROJECT_OS_EVM_EV_EXCEEDS_BAC" });
    expect(await refusal({ pv: 10, ev: 0, ac: 50, bac: 100, eacMethod: "bac_over_cpi" })).toEqual({ code: "BAD_REQUEST", message: "PROJECT_OS_EVM_CPI_NOT_POSITIVE" });
    expect(await refusal({ pv: 0, ev: 20, ac: 50, bac: 100, eacMethod: "ac_plus_remaining_over_cpi_spi" })).toEqual({ code: "BAD_REQUEST", message: "PROJECT_OS_EVM_CPI_SPI_NOT_POSITIVE" });
  });
  it("a valid set of figures still calculates", async () => {
    const result = await caller.controls.calculateEvm({ pv: 40, ev: 50, ac: 55, bac: 100, eacMethod: "bac_over_cpi" });
    expect(result.cv).toBe(-5);
    expect(result.sv).toBe(10);
  });
});
