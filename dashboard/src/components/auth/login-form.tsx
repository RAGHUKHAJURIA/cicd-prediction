"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { AlertCircle } from "lucide-react";

export function LoginForm() {
  const { login } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center mb-2">
        <h2 className="text-xl font-semibold text-[#f0f6fc]">Sign in</h2>
      </div>

      {serverError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm leading-normal">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Email Field */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-[#8b949e]" htmlFor="email">
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
          className={`h-10 px-3 rounded-lg bg-[#010409] border ${
            emailError ? "border-[#f85149]" : "border-[#30363d]"
          } text-[#f0f6fc] text-sm placeholder-[#484f58] focus:outline-none focus:border-[#1f6feb] focus:ring-4 focus:ring-[#1f6feb]/25 transition-all`}
          placeholder="username@domain.com"
        />
        {emailError && (
          <span className="text-xs text-[#f85149] mt-0.5">{emailError}</span>
        )}
      </div>

      {/* Password Field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-[13px] font-medium text-[#8b949e]" htmlFor="password">
            Password
          </label>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError("");
          }}
          className={`h-10 px-3 rounded-lg bg-[#010409] border ${
            passwordError ? "border-[#f85149]" : "border-[#30363d]"
          } text-[#f0f6fc] text-sm placeholder-[#484f58] focus:outline-none focus:border-[#1f6feb] focus:ring-4 focus:ring-[#1f6feb]/25 transition-all`}
        />
        {passwordError && (
          <span className="text-xs text-[#f85149] mt-0.5">{passwordError}</span>
        )}
      </div>

      {/* Remember me (Cosmetic) */}
      <div className="flex items-center gap-2 mt-1">
        <input
          id="remember-me"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-[#30363d] bg-[#010409] text-[#1f6feb] focus:ring-offset-[#0d1117] focus:ring-[#1f6feb]"
        />
        <label htmlFor="remember-me" className="text-xs text-[#8b949e] select-none cursor-pointer">
          Remember me for 7 days
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-10 mt-2 rounded-lg bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#1f6feb]/50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-[#f0f6fc]/10 cursor-pointer"
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

      {/* Redirect Link */}
      <div className="text-center mt-3 text-xs text-[#8b949e]">
        Don't have an account?{" "}
        <Link href="/register" className="text-[#1f6feb] hover:underline">
          Register →
        </Link>
      </div>
    </form>
  );
}
