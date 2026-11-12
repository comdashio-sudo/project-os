// The product's code for a server refusal. The tRPC error carries it in `data.projectError.code`; its `message` is the translated English SENTENCE, so a code is never
// read out of `message` (review of #252: every per-field mapping silently fell through to a general alert). Null when the error carries no product code (a network
// failure, a client-side Error).
export function projectErrorCode(error: unknown): string | null {
  return (error as { data?: { projectError?: { code?: unknown } } } | null)?.data?.projectError?.code as string | undefined ?? null;
}
