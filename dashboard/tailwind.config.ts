import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── New Design System ─────────────────────────── */
        cyber:   { DEFAULT: '#3B82F6', hover: '#2563EB', subtle: '#3B82F6' },
        indigo:  { DEFAULT: '#6366F1', hover: '#4F46E5' },

        charcoal:     '#0F0F12',
        'surface-dark': '#16181D',
        'surface-mid':  '#1E2028',

        // Severity
        critical: { DEFAULT: '#EF4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)' },
        high:     { DEFAULT: '#F97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)' },
        medium:   { DEFAULT: '#EAB308', bg: 'rgba(234,179,8,0.1)',  border: 'rgba(234,179,8,0.2)' },
        low:      { DEFAULT: '#22C55E', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.2)' },
        info:     { DEFAULT: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },

        // Grade
        'grade-a': '#22C55E',
        'grade-b': '#84CC16',
        'grade-c': '#EAB308',
        'grade-d': '#F97316',
        'grade-f': '#EF4444',

        // Neutral Cool Gray
        gray: {
          50:  '#F8F9FB',
          100: '#F1F3F7',
          200: '#E2E6EE',
          300: '#C8CFD9',
          400: '#8892A4',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },

        /* ── Legacy tokens (backward compat for dashboard) ── */
        canvas: {
          DEFAULT: '#0d1117',
          subtle:  '#161b22',
          inset:   '#010409',
        },
        border: {
          DEFAULT: '#30363d',
          muted:   '#21262d',
          subtle:  '#1b2028',
          accent:  '#1f6feb',
        },
        fg: {
          DEFAULT:  '#e6edf3',
          muted:    '#8b949e',
          subtle:   '#6e7681',
          onAccent: '#ffffff',
        },
        accent: {
          DEFAULT: '#1f6feb',
          hover:   '#388bfd',
          subtle:  '#1c2d3f',
          muted:   '#0d419d',
        },
        success: {
          DEFAULT: '#3fb950',
          subtle:  '#1a2f1d',
          muted:   '#238636',
        },
        danger: {
          DEFAULT: '#f85149',
          subtle:  '#2d1116',
          muted:   '#da3633',
        },
        warning: {
          DEFAULT: '#d29922',
          subtle:  '#272115',
          muted:   '#9e6a03',
        },
        severe: {
          DEFAULT: '#db6d28',
          subtle:  '#2b1700',
        },
        done: {
          DEFAULT: '#a371f7',
          subtle:  '#1e1229',
        },
        orangeAccent: {
          DEFAULT: '#ff5f1f',
          hover:   '#ea580c',
          subtle:  '#fff7ed',
          muted:   '#ffedd5',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        'glow-blue':   '0 0 20px rgba(59,130,246,0.3)',
        'glow-red':    '0 0 20px rgba(239,68,68,0.3)',
        'glow-green':  '0 0 20px rgba(34,197,94,0.3)',
        'glow-orange': '0 0 20px rgba(249,115,22,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.2s ease-in-out',
        'dash': 'dash 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        dash: {
          '0%':   { strokeDashoffset: '100%' },
          '100%': { strokeDashoffset: '0%' },
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }: { addUtilities: any }) {
      addUtilities({
        '.glow-accent':       { 'box-shadow': '0 0 20px rgba(31,111,235,0.35)' },
        '.glow-danger':       { 'box-shadow': '0 0 20px rgba(248,81,73,0.35)' },
        '.glow-success':      { 'box-shadow': '0 0 20px rgba(63,185,80,0.35)' },
        '.glow-warning':      { 'box-shadow': '0 0 20px rgba(210,153,34,0.35)' },
        '.glow-orangeAccent': { 'box-shadow': '0 0 20px rgba(255,95,31,0.35)' },
      });
    },
  ],
};
export default config;
