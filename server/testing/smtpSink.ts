// A throw-away SMTP server for tests: it accepts any message on a local port and keeps what it was given, so a test can read the sign-in code
// Supabase Auth (GoTrue) "mailed". Listens on loopback only. Never used outside tests.
import net from "node:net";

export type CapturedMail = { from: string; to: string[]; raw: string; subject: string; text: string };

export function startSmtpSink(port = 0): Promise<{ port: number; mails: CapturedMail[]; close(): Promise<void>; waitFor(predicate: (mail: CapturedMail) => boolean, timeoutMs?: number): Promise<CapturedMail> }> {
  const mails: CapturedMail[] = [];
  const waiters: Array<() => void> = [];
  const server = net.createServer(socket => {
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let from = ""; let to: string[] = []; let data = "";
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink ESMTP");
    socket.on("data", chunk => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          const raw = data;
          const headerEnd = raw.indexOf("\r\n\r\n");
          const headers = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
          const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : "";
          const subject = /^Subject: (.*(?:\r\n[ \t].*)*)/im.exec(headers)?.[1].replace(/\r\n[ \t]/g, " ") ?? "";
          const encoding = /^Content-Transfer-Encoding:\s*(\S+)/im.exec(headers)?.[1]?.toLowerCase();
          mails.push({ from, to, raw, subject, text: decodeBody(body, encoding) });
          waiters.splice(0).forEach(wake => wake());
          reply("250 queued");
          data = ""; from = ""; to = [];
          continue;
        }
        const newline = buffer.indexOf("\r\n");
        if (newline < 0) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO" || command === "HELO") { socket.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n"); }
        else if (command === "AUTH") reply("235 ok");
        else if (command === "MAIL") { from = /<([^>]*)>/.exec(line)?.[1] ?? ""; reply("250 ok"); }
        else if (command === "RCPT") { to.push(/<([^>]*)>/.exec(line)?.[1] ?? ""); reply("250 ok"); }
        else if (command === "DATA") { inData = true; reply("354 go"); }
        else if (command === "QUIT") { reply("221 bye"); socket.end(); return; }
        else reply("250 ok");
      }
    });
    socket.on("error", () => undefined);
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port,
    mails,
    close: () => new Promise<void>(done => server.close(() => done())),
    waitFor: (predicate, timeoutMs = 10_000) => new Promise((ok, fail) => {
      const started = Date.now();
      const check = () => {
        const found = mails.find(predicate);
        if (found) return ok(found);
        if (Date.now() - started > timeoutMs) return fail(new Error("no matching mail arrived"));
        waiters.push(check);
        setTimeout(check, 250);
      };
      check();
    }),
  })));
}

/** The text of a mail body as the reader sees it: quoted-printable and base64 bodies are decoded as UTF-8 bytes, not one character per byte. */
function decodeBody(body: string, encoding: string | undefined) {
  if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (encoding === "quoted-printable") {
    const joined = body.replace(/=\r?\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < joined.length; i += 1) {
      const hex = joined[i] === "=" ? joined.slice(i + 1, i + 3) : "";
      if (/^[0-9A-F]{2}$/i.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; } else bytes.push(...Array.from(Buffer.from(joined[i], "utf8")));
    }
    return Buffer.from(bytes).toString("utf8");
  }
  return body;
}
