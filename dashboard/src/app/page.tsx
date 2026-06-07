"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ScrollFillText } from "@/components/scroll-fill-text";
import { GithubHeatmapBg } from "@/components/github-heatmap-bg";
import { ArchitectureMap } from "@/components/architecture-map";
import { HowItWorks } from "@/components/how-it-works";
import { IntegrateYourWay } from "@/components/integrate-your-way";
import { useAuth } from "@/lib/hooks/use-auth";
import { UserMenu } from "@/components/auth/user-menu";
import {
  ArrowRight,
  ShieldAlert,
  Globe,
  Sparkles,
  Home as HomeIcon,
} from "lucide-react";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen text-gray-50 selection:bg-success/30 selection:text-white bg-black">
      {/* Navigation */}
      <div className="fixed top-4 w-full z-50 px-4">
        <nav className="max-w-7xl mx-auto h-14 rounded-full bg-[#0d1117]/40 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.5)] px-4 flex items-center justify-between">
          {/* Left: Logo & Title */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
              <ShieldAlert className="w-4.5 h-4.5 text-success" />
            </div>
            <span className="font-extrabold font-sans tracking-tight text-base text-white">
              Antigravity.
            </span>
          </div>

          {/* Center Pill */}
          <div className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-full px-1 py-1 backdrop-blur-md">
            <Link
              href="/"
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/25"
            >
              <HomeIcon className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>
            {[
              { name: "Use Cases", href: "#" },
              { name: "Docs", href: "/docs" },
              { name: "Dashboard", href: user ? "/repos" : "/login" },
            ].map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="px-3 py-1 rounded-full text-[11px] font-semibold text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <span>{item.name}</span>
              </Link>
            ))}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <Link
              href={user ? "/repos" : "/login"}
              className="hidden sm:flex items-center justify-center h-9 px-4 rounded-full text-[11px] font-bold text-gray-400 hover:text-white border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] hover:bg-white/[0.06] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <span>Repos</span>
            </Link>
            {user ? (
              <UserMenu />
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-[11px] font-bold text-gray-400 hover:text-white transition-colors px-2"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-1.5 rounded-full font-sans font-bold text-white text-[11px] bg-success hover:bg-success-muted shadow-glow-success hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-1"
                >
                  <span>Sign Up</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>

      {/* ── HERO SECTION wrapped with heatmap bg ── */}
      <div className="relative overflow-hidden" style={{ minHeight: "100vh" }}>
        {/* Canvas heatmap — fills only this wrapper */}
        <GithubHeatmapBg />

        {/* Bottom gradient fade: heatmap → solid black */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
          style={{
            height: "480px",
            background: "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 100%)",
          }}
        />

        {/* Hero content */}
        <main className="pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success border border-success/20 text-xs font-bold uppercase tracking-widest mb-8"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Scanning 10,000+ CI/CD pipelines</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
              className="text-5xl md:text-7xl font-sans font-black tracking-tighter mb-6 leading-tight"
            >
              Find Pipeline Failures <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-success to-[#2ea043]">
                Before They Happen
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
              className="text-lg md:text-xl font-sans font-medium text-gray-400 max-w-2xl mx-auto mb-10"
            >
              16 security rules. AI-powered explanations. Instant fixes.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.45 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            >
              <Link
                href={user ? "/repos" : "/login"}
                className="px-6 py-3 rounded-lg font-sans font-semibold text-white text-sm bg-success hover:bg-success-muted shadow-glow-success hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                Scan Your First Repo Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button className="px-6 py-3 rounded-lg font-sans font-semibold text-sm text-gray-300 bg-transparent border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all duration-200 flex items-center gap-2 w-full sm:w-auto justify-center">
                View Demo
              </button>
            </motion.div>

          </div>

          <ArchitectureMap />
        </main>
      </div>

      {/* Kinetic Text Reveal Section */}
      <ScrollFillText />

      <HowItWorks />


      <IntegrateYourWay />

      {/* Footer */}
      <footer className="py-12 border-t border-white/[0.06] bg-black text-center text-sm font-sans text-gray-500">
        <div className="max-w-7xl mx-auto px-6">
          <p>© 2026 Antigravity. Built for CI/CD Reliability Intelligence.</p>
        </div>
      </footer>
    </div>
  );
}


