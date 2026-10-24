// The interface language a person chose, kept on their account (work order 16, item 4, G-203). One row per user, keyed by the user id. Both functions take
// the user id of the signed-in caller and nothing else: a caller can read and write only their own row, because no other id ever reaches this module
// (routers.ts passes ctx.user.id; the procedure's input has no user field, so one sent by a client is stripped by zod). The table is a per-person
// preference, not tenant data, so there is no tenant or project filter and no permission check beyond being signed in.
import { eq, sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { INTERFACE_LANGUAGES, type InterfaceLanguage } from "@shared/interfaceLanguages";

// The table is defined here, not in drizzle/schema.ts, and it is created only by migration drizzle/0008_wo16_user_language.sql. Reason: the baseline
// (0000) is followed by 0006, which re-creates project_os_apply_conventions() with the list as it was then and runs the sweep. A table created in the
// baseline would be refused there ("not classified"). Migration 0008 creates the table and re-creates the function with the table in its list, before
// its own sweep runs. Keep this definition and that migration in step (the same columns and the same check).
export const userLanguagePreferences = pgTable(
  "user_language_preferences",
  {
    userId: integer("user_id").primaryKey(),
    language: varchar("language", { length: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "user_language_preferences_user_fk" }).onDelete("cascade"),
    check("user_language_preferences_language_check", sql`${table.language} IN ('ar', 'en', 'ur')`),
  ],
);

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
