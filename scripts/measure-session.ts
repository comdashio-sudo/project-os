// Measures what ONE authenticated request costs the database before its route even runs (server/_core/sdk.ts authenticateSession), on the local test database.
//
//   DATABASE_URL=<app-role url of project_os_integration_test> JWT_SECRET=<16+ chars> node --import tsx scripts/measure-session.ts [requests=300] [simulatedRoundTripMs=0]
//
// It prints (a) how many SQL statements each request sends -- the number that decides the cost on a real network, where every statement waits one round trip --
// and (b) wall-clock percentiles. `simulatedRoundTripMs` adds that delay in front of every statement so the effect of a distant database can be seen; it is a
// SIMULATION and is labelled so in the output. The cookie is verified locally with the server's own secret (jose, HS256): this request never calls Supabase Auth.
import pg from "pg";

const requests = Number(process.argv[2] ?? 300);
const simulatedMs = Number(process.argv[3] ?? 0);
if (!process.env.DATABASE_URL || !/project_os_integration_test/.test(process.env.DATABASE_URL)) throw new Error("DATABASE_URL must name project_os_integration_test (the only database this may touch).");
if ((process.env.JWT_SECRET ?? "").length < 16) throw new Error("JWT_SECRET (16+ characters) is required.");

let statements = 0;
const proto = pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown };
const original = proto.query;
proto.query = function (this: unknown, ...args: unknown[]) {
  statements += 1;
  if (simulatedMs <= 0) return original.apply(this, args);
  const last = args[args.length - 1];
  // callback style (what the pool uses): hold the answer back by one simulated round trip; promise style: hold the whole call.
  if (typeof last === "function") {
    const callback = last as (...a: unknown[]) => void;
    return original.apply(this, [...args.slice(0, -1), (...answer: unknown[]) => setTimeout(() => callback(...answer), simulatedMs)]);
  }
  return new Promise(resolve => setTimeout(resolve, simulatedMs)).then(() => original.apply(this, args));
};

const { sdk } = await import("../server/_core/sdk");
const { upsertUser } = await import("../server/db");
const { COOKIE_NAME } = await import("../shared/const");

const openId = `measure:${Date.now()}`;
await upsertUser({ openId, name: "measure.session", email: "measure.session@example.test", loginMethod: "email" });
const token = await sdk.issueSession(openId, { name: "measure.session" });
const req = { headers: { cookie: `${COOKIE_NAME}=${token}` } } as never;

for (let i = 0; i < 20; i++) await sdk.authenticateSession(req); // warm the pool
statements = 0;
const times: number[] = [];
for (let i = 0; i < requests; i++) {
  const started = performance.now();
  await sdk.authenticateSession(req);
  times.push(performance.now() - started);
}
times.sort((a, b) => a - b);
const at = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))]!.toFixed(2);
console.log(JSON.stringify({
  requests, simulatedRoundTripMs: simulatedMs || "none (local socket)",
  sqlStatementsPerRequest: +(statements / requests).toFixed(2),
  ms: { p50: +at(0.5), p95: +at(0.95), max: +times[times.length - 1]!.toFixed(2), mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2) },
}));
process.exit(0);
