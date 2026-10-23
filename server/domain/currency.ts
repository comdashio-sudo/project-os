// V1 money is in the Saudi riyal only (owner decision, 22 Oct 2026). Every input that carries a currency code from the client goes through
// riyalCurrency(), so a non-SAR value is refused with a translated code BEFORE any database work. The database enforces the same rule on the six
// tables that carry a currency (drizzle/0001_currency_sar.sql); this is the message the person sees instead of a raw constraint error.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const RIYAL_CODE = "SAR";

export type RiyalRefusalCode = "PROJECT_OS_CURRENCY_NOT_SAR" | "PROJECT_OS_TENDER_CURRENCY_NOT_SAR";

/** A currency code the server accepts from a client: trimmed and upper-cased, and it must be SAR. Anything else is a BAD_REQUEST carrying `code`. */
export const riyalCurrency = (code: RiyalRefusalCode = "PROJECT_OS_CURRENCY_NOT_SAR") =>
  z.string().trim().transform(value => {
    const normalised = value.toUpperCase();
    if (normalised !== RIYAL_CODE) throw new TRPCError({ code: "BAD_REQUEST", message: code });
    return normalised;
  });
