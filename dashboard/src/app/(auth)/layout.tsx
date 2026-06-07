"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Shield } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.push("/repos");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[#1f6feb] border-t-transparent animate-spin" />
          <span className="text-[#8b949e] text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[440px] flex flex-col gap-6">
        {/* Header/Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-[#1f6feb]/10 flex items-center justify-center border border-[#1f6feb]/25">
            <Shield className="h-6 w-6 text-[#1f6feb]" />
          </div>
          <h1 className="text-xl font-bold text-[#f0f6fc] tracking-tight mt-2">
            Reliability.io
          </h1>
        </div>

        {/* Content area */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
