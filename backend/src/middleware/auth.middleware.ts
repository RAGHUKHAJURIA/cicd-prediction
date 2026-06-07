import { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { repos, RepoRow } from "../db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "./error-handler";
import { AuthUser, authService, SessionData } from "../services/auth.service";

declare global {
  namespace Express {
    interface Request {
      currentUser: AuthUser | null;
      sessionData: SessionData | null;
      repo?: RepoRow | null;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    email: string;
    username: string;
    role: string;
    githubAuthState?: string;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.currentUser) {
      return next();
    }

    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
      return;
    }

    const user = await authService.findById(userId);
    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
      return;
    }

    req.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.currentUser !== undefined) {
      return next();
    }

    const userId = req.session.userId;
    if (!userId) {
      req.currentUser = null;
      return next();
    }

    const user = await authService.findById(userId);
    if (!user) {
      req.currentUser = null;
      return next();
    }

    req.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.currentUser) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
    return;
  }

  if (req.currentUser.role !== "admin") {
    res.status(403).json({
      success: false,
      error: "Admin access required",
      code: "FORBIDDEN",
    });
    return;
  }

  next();
}

export async function requireRepoOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.currentUser) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
      return;
    }

    const repoId = req.params["id"] || req.params["repoId"];
    if (!repoId) {
      return next(new AppError(400, "Repository ID is required", "BAD_REQUEST"));
    }

    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, repoId))
      .limit(1);

    if (!repo) {
      res.status(404).json({
        success: false,
        error: "Repository not found",
        code: "NOT_FOUND",
      });
      return;
    }

    if (repo.userId !== null && repo.userId !== req.currentUser.id && req.currentUser.role !== "admin") {
      res.status(403).json({
        success: false,
        error: "Access denied",
        code: "FORBIDDEN",
      });
      return;
    }

    req.repo = repo;
    next();
  } catch (err) {
    next(err);
  }
}
