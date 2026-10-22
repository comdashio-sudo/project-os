// A stand-in for Supabase Auth (GoTrue) on 127.0.0.1, for rehearsals that must sign in by e-mail code without sending any mail.
// It speaks only the three calls the application makes (server/_core/auth/supabaseAuth.ts): POST /auth/v1/otp, /verify and /logout, with
// GoTrue's status codes and error_code names, and the rules that matter: a code is single use, expires, and five wrong guesses retire it.
// "Mail" is not sent: the message text lands in `inbox` (address -> [text, ...]) for the script to read, as the old fake mail provider did.
// Listens on loopback only. The real thing is exercised separately against the supabase/gotrue image.
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";

export async function startFakeGoTrue({ anonKey = `fake-anon-${randomUUID()}`, ttlMs = 3600_000, minIntervalMs = 0, now = () => Date.now() } = {}) {
  const inbox = new Map();
  const open = new Map(); // address -> { code, expiresAt, failures }
  const sessions = new Set();
  const json = (response, status, body) => response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", chunk => { raw += chunk; });
    request.on("end", () => {
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch { /* an empty or malformed body is handled below */ }
      if (request.headers.apikey !== anonKey) return json(response, 401, { error_code: "no_authorization", msg: "No API key found in request" });
      const email = String(body.email ?? "").trim().toLowerCase();
      if (request.url === "/auth/v1/otp" && request.method === "POST") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(response, 400, { error_code: "validation_failed", msg: "Unable to validate email address: invalid format" });
        const last = open.get(email);
        if (last && now() - last.sentAt < minIntervalMs) return json(response, 429, { error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after a while." });
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        open.set(email, { code, expiresAt: now() + ttlMs, failures: 0, sentAt: now() });
        inbox.set(email, [...(inbox.get(email) ?? []), `Your sign-in code is ${code}. Valid for ${Math.round(ttlMs / 60000)} minutes.`]);
        return json(response, 200, {});
      }
      if (request.url === "/auth/v1/verify" && request.method === "POST") {
        const entry = open.get(email);
        const good = entry && entry.failures < 5 && entry.expiresAt > now() && body.type === "email" && String(body.token) === entry.code;
        if (!good) { if (entry) entry.failures += 1; return json(response, 403, { error_code: "otp_expired", msg: "Token has expired or is invalid" }); }
        open.delete(email);
        const accessToken = `fake-access-${randomUUID()}`;
        sessions.add(accessToken);
        return json(response, 200, { access_token: accessToken, token_type: "bearer", refresh_token: `fake-refresh-${randomUUID()}`, user: { id: randomUUID(), email, email_confirmed_at: new Date(now()).toISOString() } });
      }
      if (request.url === "/auth/v1/logout" && request.method === "POST") {
        sessions.delete(String(request.headers.authorization ?? "").replace(/^Bearer /, ""));
        return response.writeHead(204).end();
      }
      return json(response, 404, { error_code: "not_found", msg: "not found" });
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { port, url: `http://127.0.0.1:${port}`, anonKey, inbox, sessions, close: () => new Promise(resolve => server.close(resolve)) };
}
