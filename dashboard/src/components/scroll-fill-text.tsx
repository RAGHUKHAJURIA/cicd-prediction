"use client";

import { useRef } from "react";
import { useScroll, useTransform, motion } from "framer-motion";

const text = "73% of critical pipeline failures are caused by unpinned dependencies and misconfigurations.";

const cards = [
  "10,000+ deployments delayed weekly. No unified visibility across platforms.",
  "Unpinned actions = broken builds and silent security vulnerabilities.",
  "Manual audits fail. Engineers waste hours debugging configurations.",
];

function Word({ children, progress, range }: { children: string; progress: any; range: [number, number] }) {
  // Translate the scroll progress range to backgroundPosition from "100% 0" to "0% 0"
  const backgroundPosition = useTransform(progress, range, ["100% 0", "0% 0"]);

  return (
    <motion.span
      style={{
        background: "linear-gradient(to right, #ffffff 50%, rgba(255, 255, 255, 0.15) 50%)",
        backgroundSize: "200% 100%",
        backgroundPosition,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
      className="inline-block mr-[0.25em] select-none"
    >
      {children}
    </motion.span>
  );
}

export function ScrollFillText() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const words = text.split(" ");

  return (
    <section
      ref={containerRef}
      className="relative h-[300vh] bg-charcoal border-t border-white/[0.06]"
    >
      <div className="sticky top-0 h-screen flex items-center overflow-hidden w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-24 items-center">
            
            {/* LEFT: animated text */}
            <div className="max-w-xl">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black font-sans leading-tight text-white flex flex-wrap">
                {words.map((word, i) => {
                  // We want the entire text animation to complete within the first 60% of the scroll.
                  const start = (i / words.length) * 0.6;
                  const end = start + (1 / words.length) * 0.6;
                  return (
                    <Word key={i} progress={scrollYProgress} range={[start, end]}>
                      {word}
                    </Word>
                  );
                })}
              </h2>
            </div>

            {/* RIGHT: side cards */}
            <div className="flex flex-col gap-6">
              {cards.map((card, i) => {
                // Animate cards starting midway through
                const start = 0.5 + (i * 0.12);
                const end = start + 0.18;
                
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const opacity = useTransform(scrollYProgress, [start, end], [0, 1]);
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const y = useTransform(scrollYProgress, [start, end], [24, 0]);

                return (
                  <motion.div
                    key={i}
                    style={{ opacity, y }}
                    className="bg-surface-dark border border-white/[0.06] rounded-2xl p-6 shadow-xl relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-cyber rounded-r-md shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    <p className="text-gray-300 font-sans text-sm md:text-base font-medium pl-2">
                      {card}
                    </p>
                  </motion.div>
                );
              })}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}