export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  githubUsername: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  data?: { user: AuthUser };
  error?: string;
  code?: string;
}

const BASE = process.env["NEXT_PUBLIC_API_URL"] || "http://localhost:3000";

async function authFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include", // CRITICAL: sends session cookie
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

export const authApi = {
  async register(data: {
    email: string;
    password: string;
    username: string;
  }): Promise<AuthUser> {
    const res = await authFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });

    const body = await res.json();

    if (res.status === 201 && body.success && body.data?.user) {
      return body.data.user;
    }

    if (res.status === 409) {
      throw new Error("Email already registered");
    }

    if (res.status === 400 || body.error) {
      throw new Error(body.error || "Registration failed");
    }

    throw new Error("Registration failed");
  },

  async login(data: {
    email: string;
    password: string;
  }): Promise<AuthUser> {
    const res = await authFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    const body = await res.json();

    if (res.status === 200 && body.success && body.data?.user) {
      return body.data.user;
    }

    if (res.status === 401) {
      throw new Error("Invalid email or password");
    }

    if (res.status === 429) {
      throw new Error("Too many attempts. Try again in 15 minutes.");
    }

    throw new Error("Login failed");
  },

  async logout(): Promise<void> {
    try {
      await authFetch("/auth/logout", { method: "POST" });
    } catch (e) {
      // Always resolves (even if session already expired or network issue)
    }
  },

  async getMe(): Promise<AuthUser | null> {
    try {
      const res = await authFetch("/auth/me");
      if (res.status === 200) {
        const body = await res.json();
        return body.data?.user || null;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  async updateProfile(data: {
    username?: string;
    avatarUrl?: string;
  }): Promise<AuthUser> {
    const res = await authFetch("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    const body = await res.json();
    if (res.ok && body.success && body.data?.user) {
      return body.data.user;
    }
    throw new Error(body.error || "Failed to update profile");
  },

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const res = await authFetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (res.status === 401) {
      throw new Error("Current password is incorrect");
    }

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to change password");
    }
  },

  async deleteAccount(password: string): Promise<void> {
    const res = await authFetch("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to delete account");
    }
  },
};
