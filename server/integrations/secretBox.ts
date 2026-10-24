// Seals a secret the platform must be able to use again (a webhook's signing secret, a password for a company's other system) with AES-256-GCM.
// The key comes from INTEGRATION_SECRET_KEY, or from the session secret when that is not set; a secret sealed with one key is not readable with another,
// so changing the key means entering the connection passwords again (and nothing else breaks). A secret is shown to its owner once, when it is made, and never read back.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { ENV } from "../_core/env";

const VERSION = "v1";
const key = (): Buffer => {
  const material = process.env.INTEGRATION_SECRET_KEY || ENV.cookieSecret;
  if (!material) throw new Error("INTEGRATION_SECRET_KEY (or the session secret) is required to seal an integration secret.");
  return Buffer.from(hkdfSync("sha256", material, "project-os-integrations", "secret-box-v1", 32));
};

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function openSecret(sealed: string): string {
  const [version, payload] = sealed.split(":");
  if (version !== VERSION || !payload) throw new Error("Unknown secret format.");
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
