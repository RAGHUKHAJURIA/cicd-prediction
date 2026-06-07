"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { AlertCircle, Check } from "lucide-react";

export function RegisterForm() {
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time validations
  useEffect(() => {
    if (username) {
      if (username.length < 3 || username.length > 100) {
        setUsernameError("Username must be between 3 and 100 characters");
      } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        setUsernameError("Username can only contain letters, numbers, _ and -");
      } else {
        setUsernameError("");
      }
    } else {
      setUsernameError("");
    }
  }, [username]);

  useEffect(() => {
    if (email) {
      if (!email.includes("@") || !email.includes(".")) {
        setEmailError("Invalid email format");
      } else {
        setEmailError("");
      }
    } else {
      setEmailError("");
    }
  }, [email]);

  // Password strength meter calculation
  const getPasswordStrength = () => {
    if (!password) return { score: 0, text: "", colorClass: "" };
    
    let criteriaMet = 0;
    if (password.length >= 8 && password.length <= 72) criteriaMet++;
    if (/[A-Z]/.test(password)) criteriaMet++;
    if (/[a-z]/.test(password)) criteriaMet++;
    if (/[0-9]/.test(password)) criteriaMet++;
    if (/[^A-Za-z0-9]/.test(password)) criteriaMet++;

    let text = "Weak";
    let score = 1;
    let colorClass = "bg-[#f85149]"; // Red

    if (criteriaMet === 2) {
      text = "Fair";
      score = 2;
      colorClass = "bg-[#db6d28]"; // Orange
    } else if (criteriaMet === 3) {
      text = "Good";
      score = 3;
      colorClass = "bg-[#d4a72c]"; // Yellow
    } else if (criteriaMet >= 4) {
      text = "Strong";
      score = 4;
      colorClass = "bg-[#2ea043]"; // Green
    }

    return { score, text, colorClass, criteriaMet };
  };

  const strength = getPasswordStrength();
  const passwordsMatch = confirmPassword !== "" && password === confirmPassword;
  const showMatchError = confirmPassword !== "" && password !== confirmPassword;

  const isFormValid =
    username !== "" &&
    email !== "" &&
    password !== "" &&
    confirmPassword !== "" &&
    usernameError === "" &&
    emailError === "" &&
    passwordsMatch &&
    (strength.criteriaMet ?? 0) >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");

    if (!isFormValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ email, password, username });
    } catch (err: any) {
      setServerError(err.message || "Registration failed");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center mb-2">
        <h2 className="text-xl font-semibold text-[#f0f6fc]">Create an account</h2>
      </div>

      {serverError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm leading-normal">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Username Field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-[13px] font-medium text-[#8b949e]" htmlFor="username">
            Username
          </label>
          <span className="text-[11px] text-[#484f58] font-mono">
            {username.length} / 100
          </span>
        </div>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={100}
          className={`h-10 px-3 rounded-lg bg-[#010409] border ${
            usernameError ? "border-[#f85149]" : "border-[#30363d]"
          } text-[#f0f6fc] text-sm placeholder-[#484f58] focus:outline-none focus:border-[#1f6feb] focus:ring-4 focus:ring-[#1f6feb]/25 transition-all`}
          placeholder="octocat"
        />
        {usernameError && (
          <span className="text-xs text-[#f85149] mt-0.5">{usernameError}</span>
        )}
      </div>

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
          onChange={(e) => setEmail(e.target.value)}
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
        <label className="text-[13px] font-medium text-[#8b949e]" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 px-3 rounded-lg bg-[#010409] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#1f6feb] focus:ring-4 focus:ring-[#1f6feb]/25 transition-all"
        />
        
        {/* Password Strength Meter */}
        {password && (
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex gap-1.5 h-1">
              {[1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className={`flex-1 rounded-full h-full transition-all duration-300 ${
                    index <= strength.score ? strength.colorClass : "bg-[#21262d]"
                  }`}
                />
              ))}
            </div>
            <div className="text-[11px] text-[#8b949e]">
              Password strength: <span className="font-semibold text-[#f0f6fc]">{strength.text}</span>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Password Field */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-[#8b949e]" htmlFor="confirm-password">
          Confirm password
        </label>
        <div className="relative">
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`h-10 pl-3 pr-10 rounded-lg w-full bg-[#010409] border ${
              showMatchError ? "border-[#f85149]" : passwordsMatch ? "border-[#2ea043]" : "border-[#30363d]"
            } text-[#f0f6fc] text-sm focus:outline-none focus:border-[#1f6feb] focus:ring-4 focus:ring-[#1f6feb]/25 transition-all`}
          />
          {passwordsMatch && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded-full bg-[#2ea043]/10 border border-[#2ea043]/30">
              <Check className="h-3 w-3 text-[#2ea043]" />
            </div>
          )}
        </div>
        {showMatchError && (
          <span className="text-xs text-[#f85149] mt-0.5">Passwords don't match</span>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!isFormValid || isSubmitting}
        className="h-10 mt-2 rounded-lg bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#1f6feb]/30 disabled:text-white/40 disabled:border-transparent text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-[#f0f6fc]/10 cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Creating account...
          </>
        ) : (
          "Register"
        )}
      </button>

      {/* Redirect Link */}
      <div className="text-center mt-3 text-xs text-[#8b949e]">
        Already have an account?{" "}
        <Link href="/login" className="text-[#1f6feb] hover:underline">
          Sign in →
        </Link>
      </div>
    </form>
  );
}
