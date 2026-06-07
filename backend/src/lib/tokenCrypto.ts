import crypto from "crypto";

function getKeys() {
  const rawEncKey = process.env.ACCESS_TOKEN_ENCRYPTION_KEY;
  const rawHmacSecret = process.env.ACCESS_TOKEN_HMAC_SECRET;
  
  const encKeyHex = rawEncKey ? rawEncKey.trim() : "";
  const hmacSecret = rawHmacSecret ? rawHmacSecret.trim() : "";
  
  if (!encKeyHex || encKeyHex.length !== 64) {
    throw new Error("ACCESS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  
  if (!hmacSecret) {
    throw new Error("ACCESS_TOKEN_HMAC_SECRET must be set");
  }
  
  return {
    encryptionKey: Buffer.from(encKeyHex, "hex"),
    hmacSecret: Buffer.from(hmacSecret, "utf8"),
  };
}

/**
 * Encrypts a plaintext token using AES-256-GCM and signs the ciphertext with HMAC-SHA256.
 * Returns a dot-separated string format: hmac.iv.ciphertext.authTag (all base64-encoded)
 */
export function encryptToken(plaintext: string): string {
  const { encryptionKey, hmacSecret } = getKeys();
  
  // 12-byte IV is standard for AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8");
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  const ciphertextBase64 = ciphertext.toString("base64");
  const ivBase64 = iv.toString("base64");
  const authTagBase64 = authTag.toString("base64");
  
  // Sign the ciphertext base64 string or ciphertext bytes with HMAC-SHA256
  // To avoid character issues, we sign the raw ciphertext Buffer
  const hmac = crypto.createHmac("sha256", hmacSecret)
    .update(ciphertext)
    .digest("base64");
    
  return `${hmac}.${ivBase64}.${ciphertextBase64}.${authTagBase64}`;
}

/**
 * Decrypts a stored encrypted token. Validates HMAC signature before decrypting.
 * Throws an error if signature validation or decryption fails.
 */
export function decryptToken(storedString: string): string {
  try {
    const parts = storedString.split(".");
    if (parts.length !== 4) {
      throw new Error("Invalid stored token format");
    }
    
    const [hmacBase64, ivBase64, ciphertextBase64, authTagBase64] = parts;
    if (!hmacBase64 || !ivBase64 || !ciphertextBase64 || !authTagBase64) {
      throw new Error("Invalid stored token segments");
    }
    
    const { encryptionKey, hmacSecret } = getKeys();
    
    const iv = Buffer.from(ivBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    
    // Recompute HMAC and compare
    const recomputedHmac = crypto.createHmac("sha256", hmacSecret)
      .update(ciphertext)
      .digest("base64");
      
    const recomputedHmacBuffer = Buffer.from(recomputedHmac, "base64");
    const originalHmacBuffer = Buffer.from(hmacBase64, "base64");
    
    if (recomputedHmacBuffer.length !== originalHmacBuffer.length || 
        !crypto.timingSafeEqual(recomputedHmacBuffer, originalHmacBuffer)) {
      throw new Error("Token signature verification failed (HMAC mismatch)");
    }
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString("utf8");
  } catch (error: any) {
    console.error("Decryption failure when reading token:", error.message);
    throw new Error("Decryption failed");
  }
}
