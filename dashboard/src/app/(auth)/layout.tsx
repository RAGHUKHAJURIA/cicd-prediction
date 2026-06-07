"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Shield } from "lucide-react";
import { GithubHeatmapBg } from "@/components/github-heatmap-bg";

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
      <div className="min-h-screen bg-[#070a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-success border-t-transparent animate-spin" />
          <span className="text-gray-400 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Interactive GitHub Heatmap Background */}
      <GithubHeatmapBg fullScreen />

      {/* Dim overlay for text readability */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-none" />

      {/* Backlight Glow for the Glass Card */}
      <div 
        className="absolute pointer-events-none select-none"
        style={{
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(63, 185, 80, 0.15) 0%, rgba(31, 111, 235, 0.08) 50%, transparent 100%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          filter: "blur(60px)",
        }}
      />

      {/* Glassmorphic Container */}
      <div className="w-full max-w-[440px] flex flex-col gap-6 relative z-10">
        {/* Header/Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-success/10 backdrop-blur-md flex items-center justify-center border border-success/20 shadow-glow-success animate-pulse-slow">
            <Shield className="h-6 w-6 text-success" />
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight mt-2 drop-shadow-md">
            Reliability.io
          </h1>
        </div>

        {/* Liquid Glass Form Card */}
        <div 
          className="rounded-[32px] p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

