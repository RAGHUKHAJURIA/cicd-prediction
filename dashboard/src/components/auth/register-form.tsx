"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { AlertCircle, Check } from "lucide-react";

export function RegisterForm() {
  const router = useRouter();
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
    let colorClass = "bg-danger"; // Red

    if (criteriaMet === 2) {
      text = "Fair";
      score = 2;
      colorClass = "bg-severe"; // Orange/Severe
    } else if (criteriaMet === 3) {
      text = "Good";
      score = 3;
      colorClass = "bg-warning"; // Yellow/Warning
    } else if (criteriaMet >= 4) {
      text = "Strong";
      score = 4;
      colorClass = "bg-success"; // Green/Success
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
      const result = await register({ email, password, username });
      router.push(`/login?registered=true&email=${encodeURIComponent(result.email)}`);
    } catch (err: any) {
      setServerError(err.message || "Registration failed");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center mb-2">
        <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md">Create an account</h2>
        <p className="text-xs text-gray-400">Get started with pipeline reliability checking</p>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-danger/10 border border-danger/30 text-danger text-sm leading-normal">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Username Field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-[13px] font-medium text-gray-300" htmlFor="username">
            Username
          </label>
          <span className="text-[11px] text-gray-500 font-mono">
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
          className={`h-11 px-4 rounded-xl bg-white/[0.02] border ${
            usernameError ? "border-danger" : "border-white/10"
          } text-white text-sm placeholder-gray-500 focus:outline-none focus:border-success/50 focus:ring-4 focus:ring-success/10 transition-all`}
          placeholder="octocat"
        />
        {usernameError && (
          <span className="text-xs text-danger mt-0.5">{usernameError}</span>
        )}
      </div>

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
          onChange={(e) => setEmail(e.target.value)}
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
        <label className="text-[13px] font-medium text-gray-300" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 px-4 rounded-xl bg-white/[0.02] border border-white/10 text-white text-sm focus:outline-none focus:border-success/50 focus:ring-4 focus:ring-success/10 transition-all"
        />
        
        {/* Password Strength Meter */}
        {password && (
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex gap-1.5 h-1">
              {[1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className={`flex-1 rounded-full h-full transition-all duration-300 ${
                    index <= strength.score ? strength.colorClass : "bg-white/[0.08]"
                  }`}
                />
              ))}
            </div>
            <div className="text-[11px] text-gray-400">
              Password strength: <span className="font-semibold text-white">{strength.text}</span>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Password Field */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-gray-300" htmlFor="confirm-password">
          Confirm password
        </label>
        <div className="relative">
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`h-11 pl-4 pr-10 rounded-xl w-full bg-white/[0.02] border ${
              showMatchError ? "border-danger" : passwordsMatch ? "border-success" : "border-white/10"
            } text-white text-sm focus:outline-none focus:border-success/50 focus:ring-4 focus:ring-success/10 transition-all`}
          />
          {passwordsMatch && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded-full bg-success/10 border border-success/30">
              <Check className="h-3 w-3 text-success" />
            </div>
          )}
        </div>
        {showMatchError && (
          <span className="text-xs text-danger mt-0.5">Passwords don't match</span>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!isFormValid || isSubmitting}
        className="h-11 mt-2 rounded-full bg-success hover:bg-success/90 disabled:bg-success/30 disabled:text-white/40 disabled:border-transparent text-white font-bold text-sm flex items-center justify-center gap-2 shadow-glow-success hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer"
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
      <div className="text-center mt-3 text-xs text-gray-400">
        Already have an account?{" "}
        <Link href="/login" className="text-success hover:underline font-semibold transition-colors">
          Sign in →
        </Link>
      </div>
    </form>
  );
}

