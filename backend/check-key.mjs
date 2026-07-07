import 'dotenv/config';
import crypto from 'crypto';

const raw = process.env.GITHUB_APP_PRIVATE_KEY;
console.log('=== GitHub App Private Key Diagnostic ===\n');
console.log('GITHUB_APP_ID:', process.env.GITHUB_APP_ID);
console.log('Raw env value length:', raw?.length ?? 0);
console.log('First 30 chars:', raw?.substring(0, 30));
console.log('Last 30 chars:', raw?.substring((raw?.length ?? 30) - 30));

// Try to reconstruct PEM (same logic as app-auth.ts)
let decodedKey = raw?.trim() ?? '';
if (decodedKey.includes('-----BEGIN')) {
  console.log('\nFormat: Raw PEM with headers');
} else {
  const attemptDecode = Buffer.from(decodedKey, 'base64').toString('utf8');
  if (attemptDecode.includes('-----BEGIN')) {
    decodedKey = attemptDecode;
    console.log('\nFormat: Base64-encoded PEM');
  } else {
    const cleanBody = decodedKey.replace(/\s+/g, '');
    const lines = [];
    for (let i = 0; i < cleanBody.length; i += 64) {
      lines.push(cleanBody.substring(i, i + 64));
    }
    decodedKey =
      '-----BEGIN RSA PRIVATE KEY-----\n' +
      lines.join('\n') +
      '\n-----END RSA PRIVATE KEY-----\n';
    console.log('\nFormat: Raw body — reconstructed PEM');
  }
}

console.log('\nReconstructed PEM preview:');
console.log(decodedKey.substring(0, 120) + '...');
console.log('PEM length:', decodedKey.length);

// Try to create a key object from the PEM
try {
  const keyObj = crypto.createPrivateKey(decodedKey);
  console.log('\n✅ Key parsed successfully!');
  console.log('   Type:', keyObj.type);
  console.log('   Asymmetric type:', keyObj.asymmetricKeyType);
  console.log('   Asymmetric key size:', keyObj.asymmetricKeySize);
} catch (err) {
  console.log('\n❌ FAILED to parse key:', err.message);
  console.log('\n   This means the key body is INVALID or CORRUPTED.');
  console.log('   You need to download the .pem file again from GitHub App settings.');
}
