import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env["ENCRYPTION_KEY"];
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid ciphertext format");
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex!, "hex");
    const authTag = Buffer.from(authTagHex!, "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex!, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    throw new Error("Decryption failed");
  }
}

export function encryptIfPresent(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return encrypt(value);
}

export function decryptIfPresent(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return decrypt(value);
}
