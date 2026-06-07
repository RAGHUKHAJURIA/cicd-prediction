import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service";
import { userService } from "../services/user.service";
import { requireAuth } from "../middleware/auth.middleware";
import { createRateLimiter } from "../middleware/rate-limiter";
import { validate } from "../middleware/validate";
import { AppError } from "../middleware/error-handler";

export const authRoutes = Router();

// Rate limiter for login: 5 attempts per IP per 15 minutes
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "login",
  message: "Too many attempts. Try again in 15 minutes.",
});

// Zod schemas
const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password required"),
  username: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username: letters, numbers, _ and - only"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password required"),
});

const updateMeSchema = z.object({
  username: z.string().min(3).max(100).optional(),
  avatarUrl: z.string().url("Invalid avatar URL format").optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8).max(72),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password required"),
});

// POST /auth/register
authRoutes.post(
  "/register",
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await authService.register(req.body);

      req.session.regenerate((err) => {
        if (err) {
          return next(new AppError(500, "Session regeneration failed", "SESSION_ERROR"));
        }

        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.username = user.username;
        req.session.role = user.role;

        res.status(201).json({
          success: true,
          message: "Account created successfully",
          data: {
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              role: user.role,
              emailVerified: user.emailVerified,
              avatarUrl: user.avatarUrl,
              createdAt: user.createdAt,
            },
          },
        });
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/login
authRoutes.post(
  "/login",
  loginRateLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await authService.login(req.body);

      req.session.regenerate((err) => {
        if (err) {
          return next(new AppError(500, "Session regeneration failed", "SESSION_ERROR"));
        }

        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.username = user.username;
        req.session.role = user.role;

        res.status(200).json({
          success: true,
          message: "Logged in successfully",
          data: {
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              role: user.role,
              avatarUrl: user.avatarUrl,
            },
          },
        });
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/logout
authRoutes.post("/logout", (req: Request, res: Response, next: NextFunction): void => {
  req.session.destroy((err) => {
    if (err) {
      return next(new AppError(500, "Could not log out", "LOGOUT_ERROR"));
    }
    res.clearCookie("cicd.sid", {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
    });
    res.json({ success: true, message: "Logged out successfully" });
  });
});

// GET /auth/me
authRoutes.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.currentUser) {
      return next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
    }
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: req.currentUser.id,
          email: req.currentUser.email,
          username: req.currentUser.username,
          role: req.currentUser.role,
          emailVerified: req.currentUser.emailVerified,
          avatarUrl: req.currentUser.avatarUrl,
          githubUsername: req.currentUser.githubUsername,
          lastLoginAt: req.currentUser.lastLoginAt,
          createdAt: req.currentUser.createdAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /auth/me
authRoutes.patch(
  "/me",
  requireAuth,
  validate(updateMeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.currentUser) {
        return next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
      }

      const updated = await userService.updateProfile(req.currentUser.id, req.body);
      
      // Update session info if username changed
      if (req.body.username) {
        req.session.username = updated.username;
      }

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user: updated,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/change-password
authRoutes.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.currentUser) {
        return next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
      }

      await userService.changePassword(req.currentUser.id, req.body);

      // Regenerate session after password change for security
      const currentUserId = req.currentUser.id;
      const currentUser = await authService.findById(currentUserId);
      
      if (!currentUser) {
        return next(new AppError(500, "User not found after password change", "USER_ERROR"));
      }

      req.session.regenerate((err) => {
        if (err) {
          return next(new AppError(500, "Session regeneration failed", "SESSION_ERROR"));
        }

        req.session.userId = currentUser.id;
        req.session.email = currentUser.email;
        req.session.username = currentUser.username;
        req.session.role = currentUser.role;

        res.status(200).json({
          success: true,
          message: "Password changed successfully",
        });
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /auth/account
authRoutes.delete(
  "/account",
  requireAuth,
  validate(deleteAccountSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.currentUser) {
        return next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
      }

      await userService.deleteAccount(req.currentUser.id, req.body.password);

      req.session.destroy((err) => {
        if (err) {
          return next(new AppError(500, "Could not destroy session", "SESSION_ERROR"));
        }
        res.clearCookie("cicd.sid", {
          httpOnly: true,
          secure: process.env["NODE_ENV"] === "production",
          sameSite: "lax",
        });
        res.status(200).json({
          success: true,
          message: "Account deleted",
        });
      });
    } catch (err) {
      next(err);
    }
  }
);
