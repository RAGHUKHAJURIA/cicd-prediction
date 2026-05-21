"use client";

import { useRef } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

const text = "73% of critical pipeline failures are caused by unpinned dependencies and misconfigurations.";

const cards = [
  "10,000+ deployments delayed weekly. No unified visibility across platforms.",
  "Unpinned actions = broken builds and silent security vulnerabilities.",
  "Manual audits fail. Engineers waste hours debugging configurations.",
];

export function ScrollFillText() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Single sweep gradient for the text, matching the reference vertical reveal
  const textBackgroundPosition = useTransform(scrollYProgress, [0, 0.6], ["100% 0", "0% 0"]);

  return (
    <section
      ref={containerRef}
      className="relative h-[300vh] bg-black"
    >
      <div className="sticky top-0 h-screen flex items-center overflow-hidden w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full -mt-48">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-24 items-center">
            
            {/* LEFT: animated text */}
            <div className="max-w-xl">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-bold uppercase tracking-widest mb-8"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>The Core Problem</span>
              </motion.div>
              
              <motion.h2 
                style={{
                  background: "linear-gradient(to right, #ffffff 50%, rgba(255, 255, 255, 0.15) 50%)",
                  backgroundSize: "200% 100%",
                  backgroundPosition: textBackgroundPosition,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
                className="text-4xl md:text-5xl lg:text-6xl font-black font-sans leading-tight"
              >
                {text}
              </motion.h2>
            </div>

            {/* RIGHT: side cards */}
            <div className="flex flex-col gap-6">
              {cards.map((card, i) => (
                <div
                  key={i}
                  className="bg-surface-dark border border-white/[0.06] rounded-2xl p-6 shadow-xl relative overflow-hidden"
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-cyber rounded-r-md shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                  <p className="text-gray-400 font-sans text-sm md:text-base font-medium pl-2">
                    {card}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}