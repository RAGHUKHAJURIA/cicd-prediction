"use client";

import { motion } from "framer-motion";
import { Brain, User, Fingerprint, Search, Sparkles, ShieldCheck, GitPullRequest, ArrowRight } from "lucide-react";

export function ArchitectureMap() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <section className="py-12 relative z-20">
      <div className="max-w-[1650px] mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Top Horizon Glow (matches second image) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[300px] bg-success/30 blur-[120px] rounded-[100%] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[150px] bg-success/50 blur-[80px] rounded-[100%] pointer-events-none" />
        
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="relative w-full rounded-2xl p-[1.5px] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
        >
          {/* Base static border */}
          <div className="absolute inset-0 bg-white/[0.08]" />
          
          {/* Revolving Gradient Border (Magic Border) */}
          <div className="absolute inset-[-100%] animate-[spin_10s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_40%,#3b82f6_70%,#22c55e_90%,#3b82f6_100%)] opacity-90" />

          {/* Inner Box Content */}
          <div className="relative z-10 w-full h-full rounded-[14.5px] bg-[#080a10] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
            {/* macOS Window Header */}
            <div className="absolute top-0 left-0 right-0 h-12 border-b border-white/[0.06] flex items-center px-4 bg-white/[0.02]">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
              <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
            </div>
            {/* Center Pill */}
            <div className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-white/[0.03] border border-white/[0.05] flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-success" />
              <span className="text-xs font-medium text-gray-400 font-mono">antigravity.engine</span>
            </div>
          </div>

          {/* Diagram Container */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-0 pt-36 pb-28 px-8 xl:pr-60 relative">
            {/* Left Node */}
            <motion.div variants={itemVariants} className="relative z-10 flex items-center">
              <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-full px-6 py-3 flex items-center gap-3 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
                <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-semibold text-gray-200">GitHub Repo</span>
              </div>
              {/* Connecting Line (Desktop) */}
              <div className="hidden md:block w-16 h-[2px] bg-gradient-to-r from-orange-500/50 to-white/20 relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
            </motion.div>

            {/* Center Node */}
            <motion.div variants={itemVariants} className="relative z-20 mx-4">
              <div className="w-64 h-40 rounded-2xl bg-[#0d1117]/60 backdrop-blur-3xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_24px_48px_0_rgba(0,0,0,0.8)] flex flex-col items-center justify-center">
                {/* Outer Glow */}
                <div className="absolute inset-0 rounded-2xl shadow-[0_0_40px_rgba(57,211,83,0.15)] pointer-events-none" />
                <Brain className="w-10 h-10 text-success mb-3" strokeWidth={1.5} />
                <div className="font-bold text-white text-lg font-sans tracking-tight">Antigravity</div>
                <div className="text-gray-400 text-xs font-medium">Orchestrator</div>
              </div>
            </motion.div>

            {/* Right Nodes */}
            <motion.div variants={itemVariants} className="relative z-10 flex md:block flex-col gap-4 mt-8 md:mt-0">
              {/* Right Connecting Lines SVG (Desktop) */}
              <svg
                className="absolute right-full top-1/2 -translate-y-1/2 w-20 h-[280px] hidden md:block"
                viewBox="0 0 100 280"
                preserveAspectRatio="none"
                fill="none"
              >
                {/* Blue line to top */}
                <path d="M0,140 C40,140 40,28 100,28" stroke="#3b82f6" strokeWidth="2" strokeOpacity="0.6" />
                {/* Yellow line */}
                <path d="M0,140 C40,140 40,84 100,84" stroke="#eab308" strokeWidth="2" strokeOpacity="0.6" />
                {/* Green line (Middle) */}
                <path d="M0,140 L100,140" stroke="#22c55e" strokeWidth="2" strokeOpacity="0.6" />
                {/* Red line */}
                <path d="M0,140 C40,140 40,196 100,196" stroke="#ef4444" strokeWidth="2" strokeOpacity="0.6" />
                {/* Dark red line */}
                <path d="M0,140 C40,140 40,252 100,252" stroke="#991b1b" strokeWidth="2" strokeOpacity="0.6" />
              </svg>

              {/* Right nodes list */}
              <div className="flex flex-col gap-[18px]">
                <RightNode icon={<Search className="w-3.5 h-3.5 text-blue-400" />} title="Parse AST Map" />
                <RightNode icon={<Fingerprint className="w-3.5 h-3.5 text-yellow-400" />} title="Vulnerability Scan" />
                
                <div className="relative">
                  <RightNode icon={<Sparkles className="w-3.5 h-3.5 text-green-400" />} title="AI Explanations" />
                  {/* Info Float Box (matching the original design's floating text) */}
                  <div className="hidden xl:flex absolute left-full top-1/2 -translate-y-1/2 ml-8 items-center w-52">
                    {/* Connect arrow */}
                    <div className="absolute right-full mr-2 flex items-center text-gray-600">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 backdrop-blur-md text-xs text-gray-400 leading-relaxed shadow-lg">
                      Visually track your pipeline health and auto-fixes across all environments.
                    </div>
                  </div>
                </div>

                <RightNode icon={<ShieldCheck className="w-3.5 h-3.5 text-red-400" />} title="Risk Grading" />
                <RightNode icon={<GitPullRequest className="w-3.5 h-3.5 text-red-800" />} title="Auto-Fix PRs" />
              </div>
            </motion.div>
          </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function RightNode({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-full px-5 py-2.5 flex items-center gap-3 shadow-[0_4px_16px_0_rgba(0,0,0,0.2)] md:w-56 hover:bg-white/[0.06] transition-colors cursor-default">
      <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-300">{title}</span>
    </div>
  );
}
