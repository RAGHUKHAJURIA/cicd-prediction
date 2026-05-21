"use client";

import { useEffect, useRef } from "react";

// ── Grid config ────────────────────────────────────────────────────
const CELL = 11;          // px — square size
const GAP = 3;           // px — gap between cells
const STEP = CELL + GAP;  // 14px pitch

// GitHub dark-mode contribution palette (darkest → brightest)
const COLORS = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
const WEIGHTS = [0.48, 0.22, 0.15, 0.10, 0.05];

function pickColor(): string {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < WEIGHTS.length; i++) {
    acc += WEIGHTS[i];
    if (r < acc) return COLORS[i];
  }
  return COLORS[0];
}

export function GithubHeatmapBg() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Listen on the parent element (the hero container) so hover works
    // even when cursor is over text or buttons (relative z-10)
    const parent = wrap.parentElement || wrap;

    let grid: HTMLDivElement | null = null;
    let cols = 0;
    let rows = 0;
    let prevCell: HTMLElement | null = null;

    const rebuild = () => {
      // Clean up existing grid
      if (grid && wrap.contains(grid)) {
        wrap.removeChild(grid);
      }
      prevCell = null;

      const W = wrap.offsetWidth;
      const H = wrap.offsetHeight;
      if (W === 0 || H === 0) return;

      cols = Math.ceil(W / STEP);
      rows = Math.ceil(H / STEP);
      const total = cols * rows;

      grid = document.createElement("div");
      grid.style.cssText = [
        "position:absolute",
        "inset:0",
        "display:grid",
        `grid-template-columns:repeat(${cols},${CELL}px)`,
        `grid-template-rows:repeat(${rows},${CELL}px)`,
        `gap:${GAP}px`,
        "pointer-events:none",
        "overflow:hidden",
        "transform:translate3d(0,0,0)",
        "will-change:transform",
      ].join(";");

      const frag = document.createDocumentFragment();
      for (let i = 0; i < total; i++) {
        const el = document.createElement("div");
        el.className = "heatmap-cell";
        el.style.backgroundColor = pickColor();
        frag.appendChild(el);
      }
      grid.appendChild(frag);
      wrap.appendChild(grid);
    };

    // Use ResizeObserver to ensure cols & rows recalculate to the exact
    // rendered layout size (prevents index mismatch causing only one row to move)
    const observer = new ResizeObserver(() => {
      rebuild();
    });
    observer.observe(wrap);

    const onMove = (e: MouseEvent) => {
      if (!grid || cols === 0 || rows === 0) return;

      const rect = wrap.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / STEP);
      const row = Math.floor((e.clientY - rect.top) / STEP);

      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        if (prevCell) {
          prevCell.removeAttribute("data-active");
          prevCell = null;
        }
        return;
      }

      const index = row * cols + col;
      const cell = grid.children[index] as HTMLElement | undefined;
      if (!cell || cell === prevCell) return;

      if (prevCell) prevCell.removeAttribute("data-active");
      cell.setAttribute("data-active", "true");
      prevCell = cell;
    };

    const onLeave = () => {
      if (prevCell) {
        prevCell.removeAttribute("data-active");
        prevCell = null;
      }
    };

    parent.addEventListener("mousemove", onMove);
    parent.addEventListener("mouseleave", onLeave);

    return () => {
      observer.disconnect();
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseleave", onLeave);
      if (grid && wrap.contains(grid)) {
        wrap.removeChild(grid);
      }
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        background: "#0d1117",
        transform: "translate3d(0, 0, 0)",
        willChange: "transform",
        WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,1) 620px, rgba(0,0,0,0) 760px)",
        maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,1) 620px, rgba(0,0,0,0) 760px)",
      }}
    />
  );
}
