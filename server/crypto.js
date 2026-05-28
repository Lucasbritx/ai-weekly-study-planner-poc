import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptJson(value) {
  if (!value) return null;

  const payload = Buffer.from(value, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted);
}

function getKey() {
  const configured = process.env.APP_ENCRYPTION_KEY || "local-development-only-change-me";
  if (/^[a-f0-9]{64}$/i.test(configured)) {
    return Buffer.from(configured, "hex");
  }

  try {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall back to the derived key below.
  }

  return crypto.createHash("sha256").update(configured).digest();
}
