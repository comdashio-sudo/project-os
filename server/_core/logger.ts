// Server log lines that cannot leak. Everything that reaches the console goes through here, and what it prints is a closed set of fields:
// an event name, a request id, a path WITHOUT its query string, an error's name and code, and a few stack frames. A driver or library error's
// free-text message is never printed, because that is where a SQL statement with its values, an address, a name or a token ends up
// ("Duplicate entry 'someone@…' for key …"). Whatever string a caller does pass in the context is scrubbed first.

const SAFE_MESSAGE = /^PROJECT_OS_[A-Z0-9_]+$/;

// Order matters: the longest, most specific shapes first.
const SCRUBBERS: Array<[RegExp, string]> = [
  [/\b(?:mysql2?|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^\s'"`<>]*@[^\s'"`<>]+/gi, "[url-with-credentials]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [token]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\b(?:re|sk|pk|rk|key)_[A-Za-z0-9]{16,}\b/g, "[api-key]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[email]"],
  [/\b[0-9a-f]{32,}\b/gi, "[hex]"],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, "[long-token]"],
  [/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, "[ip]"],
  [/(?<![\w.])\+?\d[\d\s().-]{8,}\d(?![\w.])/g, "[number]"],
  [/\b\d{6}\b/g, "[code]"],
];

export function scrub(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement);
  return out;
}

export type LogContext = Record<string, string | number | boolean | null | undefined>;

/** "/api/trpc/projects.get?batch=1&input=…" becomes "/api/trpc/projects.get": no query, no fragment, bounded. */
export function safePath(url: unknown): string {
  if (typeof url !== "string") return "-";
  return scrub(url.split(/[?#]/)[0]).slice(0, 160);
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return { errorName: typeof error };
  const driver = error as Error & { code?: unknown; table?: unknown; constraint?: unknown; cause?: unknown };
  const out: Record<string, string | number> = { errorName: error.name.slice(0, 80) };
  if (typeof driver.code === "string") out.errorCode = driver.code.slice(0, 80);
  // PostgreSQL names the table and constraint (identifiers, never values); its message and detail carry the statement's values and are never printed.
  if (typeof driver.table === "string") out.table = driver.table.slice(0, 80);
  if (typeof driver.constraint === "string") out.constraint = driver.constraint.slice(0, 120);
  // Only a message of our own (a project error code) is safe to print.
  if (SAFE_MESSAGE.test(error.message)) out.errorMessage = error.message;
  const cause = driver.cause;
  if (cause instanceof Error) {
    out.causeName = cause.name.slice(0, 80);
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string") out.causeCode = causeCode.slice(0, 80);
  }
  // Frames only, never the first line (that is the message), with the machine's directory removed.
  const frames = (error.stack ?? "").split("\n").filter(line => /^\s+at /.test(line)).slice(0, 5).map(line => scrub(line.trim().replace(/\(?(?:file:\/\/)?\/[^\s)]*?\/(?=[^/\s)]+:\d+:\d+\)?$)/, "(")).slice(0, 160));
  if (frames.length) out.frames = frames.join(" | ");
  return out;
}

export function formatLog(level: "error" | "warn" | "info", event: string, error?: unknown, context: LogContext = {}): string {
  const fields: Record<string, unknown> = { level, time: new Date().toISOString(), event: scrub(event).slice(0, 120) };
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    fields[key.slice(0, 40)] = typeof value === "string" ? scrub(value).slice(0, 200) : value;
  }
  if (error !== undefined) Object.assign(fields, describeError(error));
  return JSON.stringify(fields);
}

type Sink = (line: string) => void;
let sinks: { error: Sink; warn: Sink; info: Sink } = { error: line => console.error(line), warn: line => console.warn(line), info: line => console.log(line) };
/** For tests: capture what would be printed. Returns a function that restores the console. */
export function captureLogs(capture: Sink): () => void {
  const previous = sinks;
  sinks = { error: capture, warn: capture, info: capture };
  return () => { sinks = previous; };
}

export const logError = (event: string, error?: unknown, context?: LogContext) => sinks.error(formatLog("error", event, error, context));
export const logWarn = (event: string, context?: LogContext) => sinks.warn(formatLog("warn", event, undefined, context));
export const logInfo = (event: string, context?: LogContext) => sinks.info(formatLog("info", event, undefined, context));

/** A crash or an unhandled rejection is logged in the same safe shape; an uncaught exception then ends the process so the host restarts it clean. */
export function installProcessErrorLogging() {
  process.on("unhandledRejection", reason => logError("process.unhandled_rejection", reason));
  process.on("uncaughtException", error => { logError("process.uncaught_exception", error); setTimeout(() => process.exit(1), 100).unref(); });
}
