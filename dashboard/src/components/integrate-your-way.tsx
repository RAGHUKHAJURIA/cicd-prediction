"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Code2, Check, ArrowRight } from "lucide-react";

// Standard GitHub SVG Icon
const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface CardItem {
  mode: string;
  title: string;
  description: string;
  bullets: string[];
  icon: React.ComponentType<any>;
  color: "blue" | "green" | "orange";
  glowColor: string;
  borderColor: string;
}

const CARDS_DATA: CardItem[] = [
  {
    mode: "MODE 01",
    title: "Web Dashboard",
    description: "No installation required. Paste your repository URL into the dashboard to instantly scan and view pipeline risk indicators.",
    bullets: [
      "Import public & private repos",
      "Run on-demand pipeline scans",
      "Inspect findings database",
    ],
    icon: Globe,
    color: "blue",
    glowColor: "rgba(59, 130, 246, 0.2)",
    borderColor: "rgba(59, 130, 246, 0.4)",
  },
  {
    mode: "MODE 02",
    title: "GitHub App",
    description: "Fully automate compliance. Install the app to trigger scanning workflows on push and generate ready-to-merge fix PRs automatically.",
    bullets: [
      "Auto-scan on commits & PRs",
      "Automated fix pull requests",
      "Commit status pass/fail checks",
    ],
    icon: GithubIcon,
    color: "green",
    glowColor: "rgba(63, 185, 80, 0.22)",
    borderColor: "rgba(63, 185, 80, 0.4)",
  },
  {
    mode: "MODE 03",
    title: "Developer CLI",
    description: "Shift security left. Scan local workflow YAMLs, Kubernetes manifests, and Dockerfiles on your machine before committing.",
    bullets: [
      "Integrate in pre-commit hooks",
      "Local validation, zero configuration",
      "Exportable JSON compliance reports",
    ],
    icon: Code2,
    color: "orange",
    glowColor: "rgba(249, 115, 22, 0.2)",
    borderColor: "rgba(249, 115, 22, 0.4)",
  },
];

function LiquidGlassCard({ card }: { card: CardItem }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    
    // Relative position from center (-0.5 to 0.5)
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setCoords({ x, y });

    // Absolute position inside the card (in pixels) for reflection spotlight
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setMousePos({ x: mouseX, y: mouseY });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setCoords({ x: 0, y: 0 });
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case "blue":
        return {
          iconBg: "bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)]",
          glow: "from-blue-500/10 to-transparent",
          bulletCheck: "bg-blue-500/10 text-blue-400 border-blue-500/20 group-hover/card:bg-blue-500/25 group-hover/card:border-blue-500/40",
          textAccent: "text-blue-400",
          shadowGlow: "shadow-[0_0_60px_-10px_rgba(59,130,246,0.35)]",
          topHighlight: "border-t border-blue-400/20",
        };
      case "green":
        return {
          iconBg: "bg-gradient-to-br from-success/20 to-emerald-500/10 border-success/30 text-success shadow-[0_0_20px_rgba(63,185,80,0.2)]",
          glow: "from-success/10 to-transparent",
          bulletCheck: "bg-success/10 text-success border-success/20 group-hover/card:bg-success/25 group-hover/card:border-success/40",
          textAccent: "text-success",
          shadowGlow: "shadow-[0_0_60px_-10px_rgba(63,185,80,0.4)]",
          topHighlight: "border-t border-success/20",
        };
      case "orange":
        return {
          iconBg: "bg-gradient-to-br from-orange-500/20 to-red-500/10 border-orange-500/30 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.15)]",
          glow: "from-orange-500/10 to-transparent",
          bulletCheck: "bg-orange-500/10 text-orange-400 border-orange-500/20 group-hover/card:bg-orange-500/25 group-hover/card:border-orange-500/40",
          textAccent: "text-orange-400",
          shadowGlow: "shadow-[0_0_60px_-10px_rgba(249,115,22,0.35)]",
          topHighlight: "border-t border-orange-400/20",
        };
      default:
        return {
          iconBg: "bg-white/5 border-white/10 text-white",
          glow: "from-white/5 to-transparent",
          bulletCheck: "bg-white/5 text-white border-white/10",
          textAccent: "text-white",
          shadowGlow: "shadow-none",
          topHighlight: "border-t border-white/10",
        };
    }
  };

  const c = getColorClasses(card.color);
  const Icon = card.icon;

  return (
    <div className="relative group/card h-full" style={{ perspective: "1200px" }}>
      {/* 1. Underlying Liquid Ambient Light (Glows behind the glass) */}
      <div
        className={`absolute inset-4 rounded-3xl opacity-30 blur-[50px] transition-all duration-700 ease-out group-hover/card:opacity-65 group-hover/card:blur-[35px] pointer-events-none z-0 ${c.shadowGlow}`}
        style={{
          background: `radial-gradient(circle 280px at ${mousePos.x}px ${mousePos.y}px, ${card.glowColor} 0%, transparent 80%)`,
        }}
      />

      {/* 2. The Liquid Glass Body */}
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        animate={{
          rotateX: isHovered ? -coords.y * 12 : 0,
          rotateY: isHovered ? coords.x * 12 : 0,
          y: isHovered ? -6 : 0,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative z-10 w-full h-full min-h-[460px] bg-gradient-to-b from-[#141620]/65 to-[#0b0c10]/55 backdrop-blur-[32px] border border-white/[0.08] rounded-[24px] p-8 flex flex-col justify-between transition-all duration-300 shadow-[inset_0_1.5px_0_0_rgba(255,255,255,0.18),inset_0_0_0_1px_rgba(255,255,255,0.03),0_20px_50px_-15px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Specular Edge Gloss Highlights (Top & Left highlights for high-gloss look) */}
        <div className="absolute inset-0 rounded-[23px] pointer-events-none border border-transparent border-t-white/[0.22] border-l-white/[0.16] group-hover/card:border-t-white/[0.35] group-hover/card:border-l-white/[0.25] transition-all duration-500 z-20" />

        {/* 3D Glass Face Depth Container */}
        <div style={{ transform: "translateZ(35px)", transformStyle: "preserve-3d" }} className="flex-1 flex flex-col justify-between relative z-10">
          
          {/* Card Top: Tag + Icon */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col">
              <span className={`text-[10px] font-black tracking-widest font-sans uppercase mb-1 ${c.textAccent}`}>
                {card.mode}
              </span>
              <h3 className="text-2xl font-black font-sans tracking-tight text-white mt-1">
                {card.title}
              </h3>
            </div>
            
            {/* Glossy Icon Container */}
            <div className={`w-12 h-12 rounded-[16px] border flex items-center justify-center relative overflow-hidden transition-all duration-300 group-hover/card:scale-110 shadow-lg ${c.iconBg}`}>
              {/* Gloss shine inside icon */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/5 to-transparent pointer-events-none" />
              <Icon className="w-5.5 h-5.5 relative z-10 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-400 font-sans text-[14px] leading-relaxed font-medium mb-6">
            {card.description}
          </p>

          {/* Bullets Checklist */}
          <ul className="space-y-3.5 mb-2">
            {card.bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-center gap-3 group/bullet">
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-300 ${c.bulletCheck}`}>
                  <Check className="w-3 h-3 stroke-[2.5]" />
                </div>
                <span className="text-[13px] font-sans text-gray-300 font-semibold group-hover/card:text-white transition-colors duration-300">
                  {bullet}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 4. Moving Liquid Glass Reflection Sheen (Spotlight on hover) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 z-30 mix-blend-overlay"
          style={{
            background: `radial-gradient(circle 300px at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 80%)`,
          }}
        />

        {/* Gloss diagonal reflection */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.01] to-white/[0.04] pointer-events-none z-20" />
      </motion.div>
    </div>
  );
}

export function IntegrateYourWay() {
  return (
    <section id="use-cases" className="py-24 relative z-10 border-t border-white/[0.06] bg-black overflow-hidden">
      {/* Dynamic Background Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-success/5 rounded-full blur-[120px] pointer-events-none z-0" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Title & Subtitle */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span>Flexibility & Automation</span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl font-sans font-black tracking-tighter mb-4 text-white"
          >
            Integrate <span className="text-transparent bg-clip-text bg-gradient-to-r from-success to-[#2ea043]">Your Way</span>
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-gray-400 font-sans font-medium text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Whether you need automated background checks, developer CLI workflows, or dashboard visual reports, we support your setup.
          </motion.p>
        </div>

        {/* Three Liquid Glass Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {CARDS_DATA.map((card, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.15 }}
              className="h-full"
            >
              <LiquidGlassCard card={card} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

