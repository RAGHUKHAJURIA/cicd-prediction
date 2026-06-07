import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../utils/password";
import { encryptToken, decryptToken } from "../lib/tokenCrypto";
import { eq } from "drizzle-orm";
import { AppError } from "../middleware/error-handler";

function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  return encryptToken(value);
}

function decryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptToken(value);
  } catch (err: any) {
    console.error("Failed to decrypt token in authService:", err.message);
    return null;
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  username: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  githubUsername: string | null;
  githubAccessToken?: string | null;
  createdAt?: Date;
  lastLoginAt?: Date | null;
}

export interface SessionData {
  userId: string;
  email: string;
  username: string;
  role: string;
}

export interface RegisterResult {
  email: string;
  username: string;
  registered: true;
}

class AuthService {
  async register(input: RegisterInput): Promise<RegisterResult> {
    // STEP 1 — Normalize email (lowercase, trim whitespace)
    const normalizedEmail = input.email.toLowerCase().trim();

    // STEP 2 — Validate email format (basic regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new AppError(400, "Invalid email format", "INVALID_EMAIL");
    }

    // STEP 3 — Validate password strength via validatePasswordStrength()
    const { valid, errors } = validatePasswordStrength(input.password);
    if (!valid) {
      throw new AppError(400, errors.join(", "), "WEAK_PASSWORD");
    }

    // STEP 4 — Check email not already registered
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(409, "Email already registered", "DUPLICATE_EMAIL");
    }

    // STEP 5 — Hash password
    const hashedPassword = await hashPassword(input.password);

    // STEP 6 — Insert user
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        password: hashedPassword,
        username: input.username.trim(),
        role: "user",
        emailVerified: false,
      })
      .returning();

    if (!user) {
      throw new AppError(500, "User registration failed", "REGISTRATION_FAILED");
    }

    // STEP 7 — Return RegisterResult (never include password hash in return)
    return {
      email: user.email,
      username: user.username,
      registered: true,
    };
  }

  async login(input: LoginInput): Promise<AuthUser> {
    // STEP 1 — Normalize email
    const normalizedEmail = input.email.toLowerCase().trim();

    // STEP 2 — Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    // STEP 3 — Check password is not null (OAuth users have no password)
    if (user.password === null) {
      throw new AppError(401, "This account uses GitHub login", "OAUTH_ONLY");
    }

    // STEP 4 — Verify password
    const valid = await verifyPassword(input.password, user.password);
    if (!valid) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    // STEP 5 — Update lastLoginAt
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // STEP 6 — Return AuthUser
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      githubUsername: user.githubUsername,
    };
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      githubUsername: user.githubUsername,
      githubAccessToken: decryptIfPresent(user.githubAccessToken),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async getUserGithubToken(userId: string): Promise<string | null> {
    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.githubAccessToken) return null;
    return decryptIfPresent(user.githubAccessToken);
  }

  async updateGithubToken(userId: string, token: string): Promise<void> {
    await db
      .update(users)
      .set({
        githubAccessToken: encryptIfPresent(token),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async findOrCreateOAuthUser(profile: {
    githubId: string;
    email: string;
    username: string;
    avatarUrl: string;
    accessToken: string;
  }): Promise<AuthUser> {
    // 1. Try find existing user by githubId
    const [existingByGithub] = await db
      .select()
      .from(users)
      .where(eq(users.githubId, profile.githubId))
      .limit(1);

    if (existingByGithub) {
      await db
        .update(users)
        .set({
          githubAccessToken: encryptIfPresent(profile.accessToken),
          githubUsername: profile.username,
          avatarUrl: profile.avatarUrl,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByGithub.id));

      const updated = await this.findById(existingByGithub.id);
      if (!updated) throw new Error("User updated but not found");
      return updated;
    }

    // 2. Try find by email
    const normalizedEmail = profile.email.toLowerCase().trim();
    const [existingByEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingByEmail) {
      // Link GitHub to existing account
      await db
        .update(users)
        .set({
          githubId: profile.githubId,
          githubUsername: profile.username,
          githubAccessToken: encryptIfPresent(profile.accessToken),
          avatarUrl: profile.avatarUrl,
          emailVerified: true, // auto-verified on oauth
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id));

      const updated = await this.findById(existingByEmail.id);
      if (!updated) throw new Error("User updated but not found");
      return updated;
    }

    // 3. Create new user with no password
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        password: null,
        username: profile.username,
        role: "user",
        githubId: profile.githubId,
        githubUsername: profile.username,
        githubAccessToken: encryptIfPresent(profile.accessToken),
        avatarUrl: profile.avatarUrl,
        emailVerified: true,
        lastLoginAt: new Date(),
      })
      .returning();

    if (!newUser) {
      throw new Error("OAuth user creation failed");
    }

    return {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role,
      avatarUrl: newUser.avatarUrl,
      emailVerified: newUser.emailVerified,
      githubUsername: newUser.githubUsername,
      createdAt: newUser.createdAt,
    };
  }
}

export const authService = new AuthService();
