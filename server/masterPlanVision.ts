// Drawing reading for the Master Plan (G-207): one procedure that reads a drawing image and returns PROPOSALS (shape id, suggested code, confidence)
// for the shapes the person selected. Nothing is saved and no link is created; a person decides what to apply.
//
// Order of the checks, each before the next one costs anything:
//   1. the switch: LLM_ENABLED must be exactly "true" and the provider configured (server/_core/llm.ts). Otherwise NOT_FOUND, and no provider call.
//   2. the image: a PNG or JPEG data URL of at most 3 MB whose bytes match its type (server/domain/masterPlanVision.ts).
//   3. the RBAC permission (project.write, the same one that edits the plan's entities), the project scope, and the subscription feature.
//   4. the version belongs to this tenant AND this project; only shapes of that version are sent to the model.
//   5. the model's answer is validated again: a shape id not in the request is dropped, codes are length- and character-checked.
// It is a mutation on purpose: the image travels in the body, and a query would put it in the URL.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { InvokeResult } from "./_core/llm";
import { invokeLLM, isLlmEnabled } from "./_core/llm";
import { protectedProcedure, router } from "./_core/trpc";
import { masterPlanSpatialEntities, masterPlanVersions } from "../drizzle/schema";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb } from "./db";
import {
  checkVisionImage,
  parseVisionModelOutput,
  VISION_INPUT_MAX_CHARS,
  VISION_OUTPUT_SCHEMA,
  VISION_SHAPE_LIMIT,
  VISION_SYSTEM_PROMPT,
} from "./domain/masterPlanVision";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "PAYLOAD_TOO_LARGE" | "BAD_GATEWAY", message: string) => new TRPCError({ code, message });

export type SuggestShapeCodesInput = {
  userId: number;
  tenantId: string;
  projectId: string;
  masterPlanVersionId: string;
  shapeIds: string[];
  imageDataUrl: string;
};

/** The text of the model's answer. A provider may send it as a string or as parts; only text parts count. */
function answerText(answer: InvokeResult): string | null {
  const content = answer?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content.map(part => (part.type === "text" ? part.text : "")).join("");
}

export async function suggestMasterPlanShapeCodes(input: SuggestShapeCodesInput) {
  if (!isLlmEnabled()) throw refuse("NOT_FOUND", "PROJECT_OS_VISION_NOT_AVAILABLE");

  const image = checkVisionImage(input.imageDataUrl);
  if (!image.ok) {
    throw image.reason === "too_large"
      ? refuse("PAYLOAD_TOO_LARGE", "PROJECT_OS_VISION_IMAGE_TOO_LARGE")
      : refuse("BAD_REQUEST", "PROJECT_OS_VISION_IMAGE_INVALID");
  }

  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.write", featureCode: "MASTER_PLAN_ENTITIES", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });

  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");

  const [version] = await db
    .select({ id: masterPlanVersions.id })
    .from(masterPlanVersions)
    .where(and(eq(masterPlanVersions.id, input.masterPlanVersionId), eq(masterPlanVersions.tenantId, input.tenantId), eq(masterPlanVersions.projectId, input.projectId)))
    .limit(1);
  if (!version) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");

  // Only shapes that exist in THIS version of THIS project are sent. An id from another project, tenant or version simply does not match.
  const requested = Array.from(new Set(input.shapeIds)).slice(0, VISION_SHAPE_LIMIT);
  const shapes = await db
    .select({ id: masterPlanSpatialEntities.id })
    .from(masterPlanSpatialEntities)
    .where(and(inArray(masterPlanSpatialEntities.id, requested), eq(masterPlanSpatialEntities.tenantId, input.tenantId), eq(masterPlanSpatialEntities.projectId, input.projectId), eq(masterPlanSpatialEntities.masterPlanVersionId, input.masterPlanVersionId)));
  const allowedShapeIds = new Set(shapes.map(shape => shape.id));
  if (allowedShapeIds.size === 0) return { proposals: [], saved: false as const };

  let answer: InvokeResult;
  try {
    answer = await invokeLLM({
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Shape ids: ${Array.from(allowedShapeIds).join(", ")}` },
            { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
          ],
        },
      ],
      outputSchema: { name: "master_plan_shape_codes", schema: VISION_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      maxTokens: 2000,
    });
  } catch {
    // The provider's own message can echo the drawing, so it is not passed on.
    throw refuse("BAD_GATEWAY", "PROJECT_OS_VISION_PROVIDER_FAILED");
  }

  const text = answerText(answer);
  const proposals = text === null ? null : parseVisionModelOutput(text, allowedShapeIds);
  if (!proposals) throw refuse("BAD_GATEWAY", "PROJECT_OS_VISION_OUTPUT_INVALID");
  return { proposals, saved: false as const };
}

const suggestInput = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  masterPlanVersionId: z.string().uuid(),
  shapeIds: z.array(z.string().uuid()).min(1).max(VISION_SHAPE_LIMIT),
  imageDataUrl: z.string().min(1).max(VISION_INPUT_MAX_CHARS),
}).strict();

export const masterPlanVisionRouter = router({
  suggestShapeCodes: protectedProcedure.input(suggestInput).mutation(({ ctx, input }) => suggestMasterPlanShapeCodes({ userId: ctx.user.id, ...input })),
});
