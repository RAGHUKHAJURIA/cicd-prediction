import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../utils/password";
import { eq } from "drizzle-orm";
import { AppError } from "../middleware/error-handler";
import { AuthUser, authService } from "./auth.service";

class UserService {
  async getProfile(userId: string): Promise<AuthUser> {
    const user = await authService.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }
    return user;
  }

  async updateProfile(
    userId: string,
    data: { username?: string; avatarUrl?: string }
  ): Promise<AuthUser> {
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.username !== undefined) {
      const username = data.username.trim();
      if (username.length < 3 || username.length > 100) {
        throw new AppError(
          400,
          "Username must be between 3 and 100 characters",
          "INVALID_INPUT"
        );
      }
      updateData.username = username;
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }

    return {
      id: updated.id,
      email: updated.email,
      username: updated.username,
      role: updated.role,
      avatarUrl: updated.avatarUrl,
      emailVerified: updated.emailVerified,
      githubUsername: updated.githubUsername,
    };
  }

  async changePassword(
    userId: string,
    data: { currentPassword: string; newPassword: string }
  ): Promise<void> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }

    if (!user.password) {
      throw new AppError(
        400,
        "OAuth accounts do not have a password set",
        "OAUTH_ACCOUNT"
      );
    }

    const valid = await verifyPassword(data.currentPassword, user.password);
    if (!valid) {
      throw new AppError(401, "Current password is incorrect", "INVALID_PASSWORD");
    }

    const { valid: strengthValid, errors } = validatePasswordStrength(data.newPassword);
    if (!strengthValid) {
      throw new AppError(400, errors.join(", "), "WEAK_PASSWORD");
    }

    const newHashedPassword = await hashPassword(data.newPassword);

    await db
      .update(users)
      .set({
        password: newHashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }

    if (!user.password) {
      throw new AppError(
        400,
        "OAuth accounts must disconnect from user settings",
        "OAUTH_ACCOUNT"
      );
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      throw new AppError(401, "Invalid password", "INVALID_PASSWORD");
    }

    await db.delete(users).where(eq(users.id, userId));
  }
}

export const userService = new UserService();
