"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function LoginForm() {
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";
  const prefilledEmail = searchParams.get("email") ?? "";

  const [showSuccessBanner, setShowSuccessBanner] = useState(registered);
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGithubSubmitting, setIsGithubSubmitting] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);

  // Sync state if prefilledEmail becomes available later
  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  useEffect(() => {
    if (prefilledEmail && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [prefilledEmail]);

  const validate = () => {
    let valid = true;
    
    if (!email) {
      setEmailError("Email is required");
      valid = false;
    } else if (!email.includes("@") || !email.includes(".")) {
      setEmailError("Email must be valid (contain @ and .)");
      valid = false;
    } else {
      setEmailError("");
    }

    if (!password) {
      setPasswordError("Password is required");
      valid = false;
    } else {
      setPasswordError("");
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setServerError(err.message || "Login failed");
      setIsSubmitting(false);
    }
  };

  const handleGithubLogin = async () => {
    setServerError("");
    setIsGithubSubmitting(true);
    // Simulate OAuth handshake API latency
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsGithubSubmitting(false);
    setServerError("GitHub Social Login is not configured. Please sign in with your email and password.");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showSuccessBanner && (
        <div className="flex gap-3 items-start p-4 rounded-2xl bg-success/15 border border-success/30 text-left mb-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div className="flex flex-col text-left">
            <p className="text-success text-sm font-semibold leading-normal">
              Account created successfully!
            </p>
            <p className="text-gray-300 text-xs mt-0.5 leading-normal">
              Sign in with your new credentials below.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 text-center mb-2">
        <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md">Welcome back!</h2>
        <p className="text-xs text-gray-400">Sign in to manage your CI/CD pipelines</p>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-danger/10 border border-danger/30 text-danger text-sm leading-normal">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Email Field */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-gray-300" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError("");
          }}
          className={`h-11 px-4 rounded-xl bg-white/[0.02] border ${
            emailError ? "border-danger" : "border-white/10"
          } text-white text-sm placeholder-gray-500 focus:outline-none focus:border-success/50 focus:ring-4 focus:ring-success/10 transition-all`}
          placeholder="username@domain.com"
        />
        {emailError && (
          <span className="text-xs text-danger mt-0.5">{emailError}</span>
        )}
      </div>

      {/* Password Field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-[13px] font-medium text-gray-300" htmlFor="password">
            Password
          </label>
        </div>
        <input
          ref={passwordRef}
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError("");
            if (showSuccessBanner) setShowSuccessBanner(false);
          }}
          className={`h-11 px-4 rounded-xl bg-white/[0.02] border ${
            passwordError ? "border-danger" : "border-white/10"
          } text-white text-sm placeholder-gray-500 focus:outline-none focus:border-success/50 focus:ring-4 focus:ring-success/10 transition-all`}
        />
        {passwordError && (
          <span className="text-xs text-danger mt-0.5">{passwordError}</span>
        )}
      </div>

      {/* Remember me (Cosmetic) */}
      <div className="flex items-center gap-2 mt-1">
        <input
          id="remember-me"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/[0.02] text-success focus:ring-offset-black focus:ring-success cursor-pointer"
        />
        <label htmlFor="remember-me" className="text-xs text-gray-400 select-none cursor-pointer">
          Remember me for 7 days
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 mt-2 rounded-full bg-success hover:bg-success/90 disabled:bg-success/50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-glow-success hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center my-1">
        <div className="flex-grow border-t border-white/10"></div>
        <span className="px-3 text-[10px] text-gray-500 uppercase tracking-widest font-mono select-none">Or</span>
        <div className="flex-grow border-t border-white/10"></div>
      </div>

      {/* GitHub Login Button */}
      <button
        type="button"
        onClick={handleGithubLogin}
        disabled={isGithubSubmitting}
        className="h-11 rounded-full border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] disabled:bg-transparent text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 cursor-pointer"
      >
        {isGithubSubmitting ? (
          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        )}
        <span>Sign in with GitHub</span>
      </button>

      {/* Redirect Link */}
      <div className="text-center mt-3 text-xs text-gray-400">
        Don't have an account?{" "}
        <Link href="/register" className="text-success hover:underline font-semibold transition-colors">
          Register →
        </Link>
      </div>
    </form>
  );
}

