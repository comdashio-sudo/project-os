import { initTRPC, TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { getProjectError } from "../../shared/projectErrors";
import { riyalCurrency } from "./currency";

describe("riyal-only currency input", () => {
  it("accepts SAR in any case and with surrounding spaces, and returns it upper-cased", () => {
    expect(riyalCurrency().parse("SAR")).toBe("SAR");
    expect(riyalCurrency().parse(" sar ")).toBe("SAR");
  });

  it.each(["USD", "EUR", "US", ""])("refuses %j with the translated code, before any database work", code => {
    let caught: unknown;
    try { riyalCurrency().parse(code); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(TRPCError);
    expect(caught).toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_CURRENCY_NOT_SAR" });
  });

  it("uses the tender code for tender inputs", () => {
    expect(riyalCurrency("PROJECT_OS_TENDER_CURRENCY_NOT_SAR").parse("SAR")).toBe("SAR");
    let caught: unknown;
    try { riyalCurrency("PROJECT_OS_TENDER_CURRENCY_NOT_SAR").parse("USD"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_TENDER_CURRENCY_NOT_SAR" });
  });

  it("reaches a tRPC caller as the same BAD_REQUEST, not as an internal error", async () => {
    const t = initTRPC.create();
    const caller = t.router({ echo: t.procedure.input(riyalCurrency()).query(({ input }) => input) }).createCaller({});
    await expect(caller.echo("sar")).resolves.toBe("SAR");
    await expect(caller.echo("USD")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_CURRENCY_NOT_SAR" });
  });

  it("both codes have a translated message, so the person sees the riyal rule and not the generic fallback", () => {
    for (const code of ["PROJECT_OS_CURRENCY_NOT_SAR", "PROJECT_OS_TENDER_CURRENCY_NOT_SAR"]) {
      expect(getProjectError(code).code).toBe(code);
      expect(getProjectError(code).messages.en).toMatch(/SAR/);
      expect(getProjectError(code).messages.ar).toMatch(/SAR/);
    }
  });
});
