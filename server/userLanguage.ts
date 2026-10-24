// The interface language a person chose, kept on their account (work order 16, item 4, G-203). One row per user, keyed by the user id. Both functions take
// the user id of the signed-in caller and nothing else: a caller can read and write only their own row, because no other id ever reaches this module
// (routers.ts passes ctx.user.id; the procedure's input has no user field, so one sent by a client is stripped by zod). The table is a per-person
// preference, not tenant data, so there is no tenant or project filter and no permission check beyond being signed in.
import { eq, sql } from "drizzle-orm";
import { userLanguagePreferences } from "../drizzle/schema";
import { getDb } from "./db";
import { INTERFACE_LANGUAGES, type InterfaceLanguage } from "@shared/interfaceLanguages";

export type AccountLanguage = InterfaceLanguage;

const isInterfaceLanguage = (value: unknown): value is InterfaceLanguage => typeof value === "string" && (INTERFACE_LANGUAGES as readonly string[]).includes(value);

/** The language this person chose, or null when they have never saved one on their account. */
export async function getAccountLanguage(userId: number): Promise<AccountLanguage | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const [row] = await db.select({ language: userLanguagePreferences.language }).from(userLanguagePreferences).where(eq(userLanguagePreferences.userId, userId)).limit(1);
  // The table's check constraint already admits only the three codes; the guard keeps a row written by some other path from reaching the screen.
  return row && isInterfaceLanguage(row.language) ? row.language : null;
}

/** Saves the language as this person's choice, replacing an earlier one. The caller has validated the code (zod, shared/interfaceLanguages.ts). */
export async function setAccountLanguage(userId: number, language: AccountLanguage): Promise<{ language: AccountLanguage }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await db
    .insert(userLanguagePreferences)
    .values({ userId, language })
    .onConflictDoUpdate({ target: userLanguagePreferences.userId, set: { language, updatedAt: sql`now()` } });
  return { language };
}
