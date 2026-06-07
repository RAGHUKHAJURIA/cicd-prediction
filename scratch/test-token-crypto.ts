import "dotenv/config";
import { encryptToken, decryptToken } from "../backend/src/lib/tokenCrypto";
import assert from "assert";

function runCryptoTest() {
  console.log("Starting Token Crypto verification tests...");

  const originalToken = "gho_abcdef1234567890YOURSECRETTOKENHERE";
  console.log(`- Original token to encrypt: ${originalToken}`);

  // 1. Test Encryption
  const encrypted = encryptToken(originalToken);
  console.log(`- Stored token string: ${encrypted}`);
  assert.ok(encrypted.includes("."), "Stored format should contain dots");
  const parts = encrypted.split(".");
  assert.strictEqual(parts.length, 4, "Stored format should have exactly 4 segments");

  // 2. Test Decryption
  const decrypted = decryptToken(encrypted);
  console.log(`- Decrypted token: ${decrypted}`);
  assert.strictEqual(decrypted, originalToken, "Decrypted token must match original");

  // 3. Test Signature Tampering Rejection
  const tamperedParts = [...parts];
  // Modify one character of the ciphertext base64 segment
  const oldCiphertext = tamperedParts[2]!;
  tamperedParts[2] = oldCiphertext.substring(0, oldCiphertext.length - 1) + (oldCiphertext.endsWith("A") ? "B" : "A");
  const tampered = tamperedParts.join(".");

  console.log(`- Tampered stored token: ${tampered}`);
  try {
    decryptToken(tampered);
    assert.fail("Decryption of tampered token should have failed");
  } catch (err: any) {
    console.log(`- Correctly caught expected error on tampered signature: ${err.message}`);
    assert.strictEqual(err.message, "Decryption failed", "Should throw generic Decryption failed error");
  }

  console.log("All Token Crypto tests PASSED successfully!");
}

runCryptoTest();
