export type GovernedSupportReply = {
  reply: string;
  citations: string[];
  shouldEscalate: boolean;
};

const mandatoryEscalationPattern = /\b(price|pricing|quote|refund|compensation|reimburse(?:ment)?|repair\s*(?:date|time|timeline)|fix\s*(?:date|time|timeline)|service\s*level|sla|contract(?:ual)?\s*(?:promise|commitment)|guarantee)\b|(?:سعر|تسعير|عرض\s*سعر|استرداد|تعويض|موعد\s*(?:إصلاح|حل)|تاريخ\s*(?:إصلاح|حل)|مستوى\s*الخدمة|اتفاقية\s*مستوى\s*الخدمة|التزام\s*(?:تعاقدي|بالعقد)|ضمان)/i;

export function requiresMandatoryHumanEscalation(text: string) {
  return mandatoryEscalationPattern.test(text);
}

export function validateKnowledgeBackedSupportReply(value: unknown, allowedArticleIds: ReadonlySet<string>): GovernedSupportReply | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { reply?: unknown; citations?: unknown; shouldEscalate?: unknown };
  if (typeof candidate.reply !== "string" || !candidate.reply.trim() || candidate.reply.length > 4000) return null;
  if (!Array.isArray(candidate.citations) || !candidate.citations.every(id => typeof id === "string" && allowedArticleIds.has(id))) return null;
  if (typeof candidate.shouldEscalate !== "boolean") return null;
  return { reply: candidate.reply.trim(), citations: candidate.citations, shouldEscalate: candidate.shouldEscalate };
}
