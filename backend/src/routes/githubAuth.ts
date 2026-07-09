import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { encryptToken } from "../lib/tokenCrypto";
import { AppError } from "../middleware/error-handler";
import { sendWelcomeEmail } from "../lib/mailer";

export const githubAuthRouter = Router();

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3001";

// GET /auth/github
githubAuthRouter.get(
  "/github",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const state = crypto.randomBytes(16).toString("hex");
      req.session.githubAuthState = state;
      
      if (req.query.redirect) {
        req.session.githubAuthRedirect = req.query.redirect as string;
      }
      
      req.session.save((err) => {
        if (err) {
          return next(new AppError(500, "Failed to save state in session", "SESSION_ERROR"));
        }
        
        const client_id = process.env.GITHUB_CLIENT_ID;
        const callback_url = process.env.GITHUB_CALLBACK_URL;
        
        if (!client_id) {
          return res.redirect(`${DASHBOARD_URL}/login?error=missing_config`);
        }
        
        const requestedScope = req.query.scope === "repo" ? "repo read:user user:email" : "read:user user:email";
        
        const params = new URLSearchParams({
          client_id,
          scope: requestedScope,
          state,
        });
        
        if (callback_url) {
          params.append("redirect_uri", callback_url);
        }
        
        const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
        res.redirect(authUrl);
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /auth/github/callback
githubAuthRouter.get(
  "/github/callback",
  async (req: Request, res: Response): Promise<void> => {
    const { code, state, error: githubError, installation_id } = req.query;
    
    // Handle GitHub App installation redirect
    if (installation_id) {
      return res.redirect(`${DASHBOARD_URL}/settings/integrations?installed=true`);
    }
    
    // Handle user cancellation or GitHub errors
    if (githubError) {
      console.warn("GitHub OAuth access denied by user:", githubError);
      return res.redirect(`${DASHBOARD_URL}/login?error=access_denied`);
    }
    
    const storedState = req.session.githubAuthState;
    
    // Validate CSRF state
    if (!state || !storedState || state !== storedState) {
      console.error("GitHub OAuth CSRF state mismatch:", { state, storedState });
      return res.redirect(`${DASHBOARD_URL}/login?error=state_mismatch`);
    }
    
    // Clean up CSRF state from session
    delete req.session.githubAuthState;
    
    if (!code) {
      return res.redirect(`${DASHBOARD_URL}/login?error=missing_code`);
    }
    
    try {
      // 1. Exchange authorization code for an access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_CALLBACK_URL,
          state,
        }),
      });
      
      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed with status ${tokenRes.status}`);
      }
      
      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (tokenData.error) {
        throw new Error(`GitHub token exchange error: ${tokenData.error}`);
      }
      
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error("No access token returned by GitHub");
      }
      
      // 2. Fetch user profile
      const profileRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "Antigravity-CI-CD",
        },
      });
      
      if (!profileRes.ok) {
        throw new Error(`Profile fetch failed with status ${profileRes.status}`);
      }
      
      const profile = (await profileRes.json()) as {
        id: number;
        login: string;
        email?: string | null;
        avatar_url?: string;
      };
      
      const githubId = String(profile.id);
      const githubUsername = profile.login;
      const avatarUrl = profile.avatar_url || null;
      
      // 3. Fetch verified primary email
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "Antigravity-CI-CD",
        },
      });
      
      let email: string | null = null;
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        
        const primaryEmailObj = emails.find((e) => e.primary && e.verified);
        if (primaryEmailObj) {
          email = primaryEmailObj.email.toLowerCase().trim();
        }
      }
      
      // Fallback to profile email if primary verified email is not found
      if (!email && profile.email) {
        email = profile.email.toLowerCase().trim();
      }
      
      if (!email) {
        return res.redirect(`${DASHBOARD_URL}/login?error=email_required`);
      }
      
      // 4. Encrypt the access token using encryptToken() before DB persistence
      const encryptedAccessToken = encryptToken(accessToken);
      
      let loggedInUser: typeof users.$inferSelect | null = null;
      
      // ACCOUNT LOOKUP LOGIC
      
      // Case 1: Look up user by github_id
      const [existingByGithub] = await db
        .select()
        .from(users)
        .where(eq(users.githubId, githubId))
        .limit(1);
        
      if (existingByGithub) {
        await db
          .update(users)
          .set({
            githubAccessToken: encryptedAccessToken,
            githubUsername,
            avatarUrl,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingByGithub.id));
          
        const [updated] = await db
          .select()
          .from(users)
          .where(eq(users.id, existingByGithub.id))
          .limit(1);
        loggedInUser = updated || null;
      } else {
        // Case 2: Look up by email
        const [existingByEmail] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
          
        if (existingByEmail) {
          // Verify that this email is not already linked to a different github_id
          if (existingByEmail.githubId && existingByEmail.githubId !== githubId) {
            console.warn("Account conflict: Email linked to a different GitHub account:", email);
            return res.redirect(`${DASHBOARD_URL}/login?error=account_conflict`);
          }
          
          await db
            .update(users)
            .set({
              githubId,
              githubUsername,
              githubAccessToken: encryptedAccessToken,
              avatarUrl,
              emailVerified: true,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingByEmail.id));
            
          const [updated] = await db
            .select()
            .from(users)
            .where(eq(users.id, existingByEmail.id))
            .limit(1);
          loggedInUser = updated || null;
        } else {
          // Case 3: New user via GitHub
          const usernameVal = githubUsername || email.split("@")[0] || "github_user";
          
          const [inserted] = await db
            .insert(users)
            .values({
              email,
              password: null, // Nullable password for GitHub-only users
              username: usernameVal,
              role: "user",
              githubId,
              githubUsername,
              githubAccessToken: encryptedAccessToken,
              avatarUrl,
              emailVerified: true,
              lastLoginAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
            
          loggedInUser = inserted || null;

          // Fire-and-forget: send welcome email for new GitHub user
          if (loggedInUser) {
            sendWelcomeEmail({
              to: loggedInUser.email,
              username: loggedInUser.username,
              provider: "github",
            });
          }
        }
      }
      
      if (!loggedInUser) {
        throw new Error("Failed to retrieve or create user record during OAuth callback");
      }
      
      // 5. Create session exactly as the existing login flow does
      req.session.regenerate((err) => {
        if (err) {
          console.error("OAuth session regeneration failed:", err);
          return res.redirect(`${DASHBOARD_URL}/login?error=session_error`);
        }
        
        req.session.userId = loggedInUser!.id;
        req.session.email = loggedInUser!.email;
        req.session.username = loggedInUser!.username;
        req.session.role = loggedInUser!.role;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("OAuth session save failed:", saveErr);
            return res.redirect(`${DASHBOARD_URL}/login?error=session_error`);
          }
          
          const redirectUrl = req.session.githubAuthRedirect || `${DASHBOARD_URL}/login?success=github`;
          delete req.session.githubAuthRedirect;
          res.redirect(redirectUrl);
        });
      });
    } catch (error: any) {
      console.error("Error during GitHub OAuth callback execution:", error.message);
      return res.redirect(`${DASHBOARD_URL}/login?error=auth_failed`);
    }
  }
);
