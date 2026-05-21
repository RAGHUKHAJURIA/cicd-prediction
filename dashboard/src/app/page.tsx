"use client";

import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { ScrollFillText } from "@/components/scroll-fill-text";
import {
  ArrowRight,
  ShieldAlert,
  Terminal,
  Activity,
  Wrench,
  Globe,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";

// Animated Counter Component
function AnimatedScore({ score, grade }: { score: number; grade: string }) {
  const [displayScore, setDisplayScore] = useState(0);
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const duration = 1400;
    const raf = requestAnimationFrame(function tick() {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * score));
      if (progress < 1) requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [inView, score]);

  const gradeColors: Record<string, string> = {
    A: "#22C55E",
    B: "#84CC16",
    C: "#EAB308",
    D: "#F97316",
    F: "#EF4444",
  };

  return (
    <span
      ref={ref}
      className="text-5xl font-black font-sans tracking-tighter transition-colors duration-1000"
      style={{ color: gradeColors[grade] || gradeColors.C }}
    >
      {displayScore}
    </span>
  );
}

export default function Home() {
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: howItWorksScrollY } = useScroll({
    target: howItWorksRef,
    offset: ["start center", "end center"],
  });
  const dotPosition = useTransform(howItWorksScrollY, [0, 1], ["0%", "100%"]);

  return (
    <div className="min-h-screen bg-charcoal text-gray-50 selection:bg-cyber/30 selection:text-white">
      {/* Background glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyber/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-charcoal/60 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyber/10 border border-cyber/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-cyber" />
            </div>
            <span className="font-bold font-sans tracking-tight text-lg">
              Antigravity
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/repos"
              className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/repos"
              className="px-5 py-2 rounded-lg font-sans font-semibold text-white text-sm bg-cyber hover:bg-blue-600 shadow-glow-blue hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Scan Your First Repo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyber/10 text-cyber border border-cyber/20 text-xs font-bold uppercase tracking-widest mb-8"
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
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyber to-indigo">
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
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <Link
              href="/repos"
              className="px-6 py-3 rounded-lg font-sans font-semibold text-white text-sm bg-cyber hover:bg-blue-600 shadow-glow-blue hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              Scan Your First Repo Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button className="px-6 py-3 rounded-lg font-sans font-semibold text-sm text-gray-300 bg-transparent border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all duration-200 flex items-center gap-2 w-full sm:w-auto justify-center">
              View Demo
            </button>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto border-t border-white/[0.06] pt-12"
          >
            {[
              { label: "Security Rules", value: "16" },
              { label: "Risk Grading", value: "A-F" },
              { label: "AI-Powered Fixes", value: "✓" },
              { label: "Scan Time", value: "< 10s" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-sans font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-xs font-sans font-medium text-gray-500 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </main>

      {/* Kinetic Text Reveal Section */}
      <ScrollFillText />

      {/* Live Demo Card Section */}
      <section className="py-24 relative z-10 border-t border-white/[0.06] bg-surface-dark/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="bg-[#16181D] rounded-2xl p-6 lg:p-8 border border-white/[0.06] shadow-xl relative overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-12">
              {/* Score Ring */}
              <div className="relative w-48 h-48 mx-auto md:mx-0 flex-shrink-0">
                <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                  <circle cx="80" cy="80" r="65" fill="none" stroke="#1E2028" strokeWidth="12" />
                  <circle
                    cx="80"
                    cy="80"
                    r="65"
                    fill="none"
                    stroke="#F97316"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray="408.4"
                    strokeDashoffset="408.4"
                    className="score-ring-fill transition-all duration-1000 ease-out"
                    style={{
                      filter: "drop-shadow(0 0 8px rgba(249,115,22,0.6))",
                      "--ring-offset": `${408.4 - (67 / 100) * 408.4}`,
                    } as any}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <AnimatedScore score={67} grade="D" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">
                    Risk Score
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2 rounded-full text-xs font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">
                    <span className="text-[10px] uppercase tracking-wider">Grade</span>
                    <span className="text-sm font-black">D</span>
                  </div>
                </div>
              </div>

              {/* Finding Details */}
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  <SeverityPill severity="critical" count={2} />
                  <SeverityPill severity="high" count={5} />
                  <SeverityPill severity="medium" count={8} />
                  <SeverityPill severity="low" count={3} />
                </div>

                <div className="bg-gray-900 border border-white/[0.06] rounded-xl p-4 font-mono text-xs overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none" />
                  <div className="text-green-400 flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Analyzing pipeline configurations...</span>
                  </div>
                  <div className="text-gray-500 mt-2">→ Loaded .github/workflows/deploy.yml (GitHub Actions)</div>
                  <div className="text-gray-500 mt-1">→ Found outdated and unpinned dependency: `actions/checkout@v2`</div>
                  <div className="text-yellow-500 mt-2">→ Warn: Insecure run parameter `enable-custom-arguments` permitted</div>
                  <div className="text-cyber mt-4 font-bold flex items-center gap-1">
                    Generating automated PR with SHA-pinned revisions<span className="cursor-blink">_</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section ref={howItWorksRef} className="py-24 relative z-10 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-sans font-bold tracking-tight mb-4">
              How It Works
            </h2>
            <p className="text-gray-400 font-sans font-medium text-lg">
              Three steps to a reliable deployment pipeline.
            </p>
          </div>

          <div className="relative pb-12">
            <div className="absolute left-8 top-0 bottom-0 w-px bg-white/[0.06] md:left-1/2 md:-translate-x-1/2" />
            <motion.div 
              className="absolute left-[32.5px] md:left-1/2 w-3 h-3 bg-cyber rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] z-20 -translate-x-1/2"
              style={{ top: dotPosition, marginTop: "-6px" }}
            />
            
            {[
              {
                title: "Connect Repository",
                desc: "Integrate with GitHub or GitLab in seconds. No complex configuration required.",
                icon: Globe,
                color: "text-white",
              },
              {
                title: "Scan Runs Automatically",
                desc: "Our engine parses your YAML and Dockerfiles, checking against 16 core rules.",
                icon: Loader2,
                color: "text-cyber",
                animate: "animate-spin",
              },
              {
                title: "Get AI-Powered Report",
                desc: "Review findings, risk grades, and instantly merge automated fix PRs.",
                icon: Sparkles,
                color: "text-indigo",
              }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
                className={`relative flex items-center gap-6 mb-12 last:mb-0 ${
                  i % 2 === 0 ? "md:flex-row-reverse md:text-right" : "md:flex-row"
                } md:gap-16 pl-16 md:pl-0`}
              >
                <div className="flex-1 md:w-1/2" />
                <div className="flex-1 md:w-1/2">
                  <div className={`w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4 ${
                    i % 2 === 0 ? "md:ml-auto" : ""
                  }`}>
                    <step.icon className={`w-6 h-6 ${step.color} ${step.animate || ""}`} />
                  </div>
                  <h3 className="text-xl font-sans font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-gray-400 font-sans text-sm leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Rule Categories */}
      <section className="py-24 relative z-10 border-t border-white/[0.06] bg-surface-dark/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight mb-2">
              Comprehensive Coverage
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: "Security Rules", count: 5, color: "bg-red-500/10 border-red-500/20 text-red-500" },
              { name: "Reliability Rules", count: 6, color: "bg-orange-500/10 border-orange-500/20 text-orange-500" },
              { name: "Performance Rules", count: 3, color: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500" },
              { name: "Maintainability Rules", count: 2, color: "bg-green-500/10 border-green-500/20 text-green-500" },
            ].map((cat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="bg-surface-mid rounded-xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 border ${cat.color}`}>
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="text-2xl font-black font-sans text-white mb-1">{cat.count}</div>
                <div className="text-sm font-sans font-medium text-gray-400">{cat.name}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/[0.06] bg-charcoal text-center text-sm font-sans text-gray-500">
        <div className="max-w-7xl mx-auto px-6">
          <p>© 2026 Antigravity. Built for CI/CD Reliability Intelligence.</p>
        </div>
      </footer>
    </div>
  );
}

function SeverityPill({ severity, count }: { severity: string, count: number }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    high:     'bg-orange-500/10 text-orange-500 border-orange-500/20',
    medium:   'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    low:      'bg-green-500/10 text-green-500 border-green-500/20',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${colors[severity] || colors.info}`}>
      <span className="text-sm">{count}</span>
      <span className="uppercase tracking-wide text-[10px]">{severity}</span>
    </div>
  );
}
