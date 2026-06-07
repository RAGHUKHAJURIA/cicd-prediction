import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = {
  title: "Sign in — Reliability.io",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-4 text-sm text-[#8b949e]">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
