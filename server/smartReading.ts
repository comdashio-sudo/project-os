// The optional AI reading behind the smart import box: for the files a deterministic reader cannot open (PDF, scanned images, free text).
// OFF unless the owner sets LLM_ENABLED=true with a provider (server/_core/llm.ts). When on, a company-wide monthly cap (SMART_READING_MONTHLY_CAP_USD) stops it,
// and the estimated cost is shown BEFORE the run, so the person decides knowing the price. When off the answer is one stable code the screen words.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { invokeLLM, isLlmEnabled } from "./_core/llm";
import { getDb } from "./db";
import { smartReadingUsage } from "../drizzle/schema";

export const isSmartReadingEnabled = () => isLlmEnabled();
/** A rough price, not a quote: a fixed part per call plus a part per megabyte sent. Said as an estimate on the screen. */
export const estimateSmartReadingMicroUsd = (bytes: number) => 20_000 + Math.ceil(bytes / (1024 * 1024)) * 15_000;
const monthOf = (date = new Date()) => date.toISOString().slice(0, 7);

export async function smartReadingUsageThisMonth(tenantId: string, now = new Date()) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const rows = await db.execute(sql`SELECT calls, estimated_micro_usd FROM smart_reading_usage WHERE tenant_id = ${tenantId} AND month = ${monthOf(now)}`);
  const row = rows.rows[0] as { calls?: number; estimated_micro_usd?: number } | undefined;
  return { calls: Number(row?.calls ?? 0), usedMicroUsd: Number(row?.estimated_micro_usd ?? 0), capMicroUsd: Math.round(ENV.smartReadingMonthlyCapUsd * 1_000_000) };
}

/** What the screen shows before the run: whether it is on, what this file would cost, and what is left this month. */
export async function smartReadingQuote(tenantId: string, bytes: number) {
  if (!isSmartReadingEnabled()) return { enabled: false as const };
  const usage = await smartReadingUsageThisMonth(tenantId);
  const estimate = estimateSmartReadingMicroUsd(bytes);
  return { enabled: true as const, estimateMicroUsd: estimate, usedMicroUsd: usage.usedMicroUsd, capMicroUsd: usage.capMicroUsd, withinCap: usage.usedMicroUsd + estimate <= usage.capMicroUsd };
}

export async function assertSmartReadingAllowed(tenantId: string, bytes: number) {
  if (!isSmartReadingEnabled()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PROJECT_OS_SMART_READING_DISABLED" });
  const quote = await smartReadingQuote(tenantId, bytes);
  if (quote.enabled && !quote.withinCap) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "PROJECT_OS_SMART_READING_CAP_REACHED" });
  return quote;
}

async function recordUsage(tenantId: string, micro: number) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  await db.execute(sql`INSERT INTO ${smartReadingUsage} (id, tenant_id, month, calls, estimated_micro_usd) VALUES (${randomUUID()}, ${tenantId}, ${monthOf()}, 1, ${micro})
    ON CONFLICT (tenant_id, month) DO UPDATE SET calls = smart_reading_usage.calls + 1, estimated_micro_usd = smart_reading_usage.estimated_micro_usd + ${micro}, updated_at = now()`);
}

const csvCell = (value: unknown) => { const text = String(value ?? "").replace(/\r?\n/g, " "); return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };

/** Reads a PDF or an image into a table (as CSV text, which the ordinary reader then understands). Throws the disabled / cap codes before any call is made. */
export async function readTableWithAi(input: { tenantId: string; bytes: Uint8Array; fileName: string; kind: "pdf" | "image" }) {
  await assertSmartReadingAllowed(input.tenantId, input.bytes.length);
  const mime = input.kind === "pdf" ? "application/pdf" : /\.png$/i.test(input.fileName) ? "image/png" : "image/jpeg";
  const url = `data:${mime};base64,${Buffer.from(input.bytes).toString("base64")}`;
  const content = input.kind === "pdf" ? { type: "file_url" as const, file_url: { url, mime_type: "application/pdf" as const } } : { type: "image_url" as const, image_url: { url, detail: "high" as const } };
  const result = await invokeLLM({
    messages: [
      { role: "system", content: "Extract the main table of this document. Answer with JSON only: {\"headers\": string[], \"rows\": string[][]}. Keep the text exactly as written, including Arabic and digits. Do not invent rows." },
      { role: "user", content: [{ type: "text", text: "Extract the table." }, content] },
    ],
    responseFormat: { type: "json_object" },
  });
  await recordUsage(input.tenantId, estimateSmartReadingMicroUsd(input.bytes.length));
  const raw = result.choices[0]?.message.content;
  const textOut = typeof raw === "string" ? raw : (raw ?? []).map(part => (part.type === "text" ? part.text : "")).join("");
  let parsed: { headers?: unknown; rows?: unknown };
  try { parsed = JSON.parse(textOut); } catch { throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "PROJECT_OS_SMART_READING_UNREADABLE" }); }
  if (!Array.isArray(parsed.headers) || !Array.isArray(parsed.rows) || !parsed.rows.length) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "PROJECT_OS_SMART_READING_UNREADABLE" });
  const lines = [parsed.headers, ...(parsed.rows as unknown[][]).filter(Array.isArray)].map(row => row.map(csvCell).join(","));
  return new TextEncoder().encode(`﻿${lines.join("\n")}`);
}
