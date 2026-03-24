import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const secret = process.env.AUTH_SECRET || "fallback-secret-for-local-dev";
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(cipherText: string): string {
  const [ivB64, tagB64, bodyB64] = cipherText.split(".");
  if (!ivB64 || !tagB64 || !bodyB64) throw new Error("Invalid encrypted secret format");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}
