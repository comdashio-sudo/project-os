// What each row of the import log means to the person reading it. An import row is an ATTEMPT: most never write anything (the file was refused, or nobody confirmed it).
//   rejected    the analysis found errors (or the job failed): nothing was written
//   awaiting    the analysis passed; waiting for the person to confirm
//   processing  being analysed or imported right now
//   imported    confirmed and written
//   undone      was imported, then rolled back by a project manager
export type AttemptState = "rejected" | "awaiting" | "processing" | "imported" | "undone";

export function attemptState(row: { status: string; errorCount: number }): AttemptState {
  switch (row.status) {
    case "completed": return "imported";
    case "cancelled": return "undone";
    case "analyzing": case "importing": case "confirmed": return "processing";
    case "failed": return "rejected";
    case "uploaded": return row.errorCount > 0 ? "rejected" : "awaiting";
    default: return "awaiting"; // validated
  }
}
/** A rejected or unconfirmed attempt wrote nothing and can be deleted; an imported one can only be rolled back. */
export const canDiscardAttempt = (state: AttemptState) => state === "rejected" || state === "awaiting";
export const canRollbackAttempt = (state: AttemptState) => state === "imported";
