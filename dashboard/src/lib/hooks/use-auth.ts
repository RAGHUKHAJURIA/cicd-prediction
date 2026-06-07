"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { authApi, AuthUser } from "../auth-api";

export function useAuth() {
  const router = useRouter();

  const { data: user, isLoading, mutate } = useSWR<AuthUser | null>(
    "/auth/me",
    () => authApi.getMe(),
    {
      revalidateOnFocus: true, // re-check session when user switches back to tab
      revalidateOnReconnect: true,
      dedupingInterval: 30000, // don't re-fetch more than once per 30 seconds
    }
  );

  const login = async (email: string, password: string) => {
    await authApi.login({ email, password });
    await mutate();
    
    // Check if there is a redirect path
    const params = new URLSearchParams(window.location.search);
    const fromPath = params.get("from");
    router.push(fromPath || "/repos");
  };

  const logout = async () => {
    await authApi.logout();
    await mutate(null, false); // clear user from cache immediately without revalidation
    router.push("/login");
  };

  const register = async (data: {
    email: string;
    password: string;
    username: string;
  }) => {
    await authApi.register(data);
    await mutate();
    router.push("/repos");
  };

  const isAuthenticated = user !== null && user !== undefined;
  const isAdmin = user?.role === "admin";

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    register,
    mutate,
  };
}
