import bcrypt from "bcryptjs";

const COST_FACTOR = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < 8) {
    throw new Error("Password too short");
  }
  if (plaintext.length > 72) {
    throw new Error("Password too long");
  }
  return bcrypt.hash(plaintext, COST_FACTOR);
}

export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch (error) {
    return false;
  }
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (password.length > 72) {
    errors.push("Password must be 72 characters or less");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Must contain at least one number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
