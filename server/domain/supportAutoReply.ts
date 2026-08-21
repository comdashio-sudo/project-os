export type GovernedSupportReply = {
  reply: string;
  citations: string[];
  shouldEscalate: boolean;
};

export function validateKnowledgeBackedSupportReply(value: unknown, allowedArticleIds: ReadonlySet<string>): GovernedSupportReply | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { reply?: unknown; citations?: unknown; shouldEscalate?: unknown };
  if (typeof candidate.reply !== "string" || !candidate.reply.trim() || candidate.reply.length > 4000) return null;
  if (!Array.isArray(candidate.citations) || !candidate.citations.every(id => typeof id === "string" && allowedArticleIds.has(id))) return null;
  if (typeof candidate.shouldEscalate !== "boolean") return null;
  return { reply: candidate.reply.trim(), citations: candidate.citations, shouldEscalate: candidate.shouldEscalate };
}
