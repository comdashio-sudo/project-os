// Work that continues after the HTTP response has been sent.
//
// On Vercel a function stops when its response is sent unless the work is registered with `waitUntil`, which keeps it alive up to the function's
// maxDuration. Elsewhere (a Node server, the tests) the promise simply keeps running. A failure is logged, never thrown into a finished request:
// whoever started the job records its failure on the job's own row.
import { waitUntil } from "@vercel/functions";
import { logError } from "./logger";

export function runAfterResponse(label: string, work: () => Promise<unknown>): Promise<void> {
  const running = Promise.resolve()
    .then(work)
    .then(() => undefined)
    .catch(error => logError("background.work_failed", error, { label }));
  try { waitUntil(running); } catch { /* not on Vercel: the promise runs on its own */ }
  return running;
}
