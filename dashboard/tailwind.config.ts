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
        }
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"Noto Sans"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.2s ease-in-out',
        'dash': 'dash 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        dash: {
          '0%': { strokeDashoffset: '100%' },
          '100%': { strokeDashoffset: '0%' },
        },
      }
    },
  },
  plugins: [
    function({ addUtilities }: { addUtilities: any }) {
      addUtilities({
        '.glow-accent': { 'box-shadow': '0 0 20px rgba(31,111,235,0.35)' },
        '.glow-danger': { 'box-shadow': '0 0 20px rgba(248,81,73,0.35)' },
        '.glow-success': { 'box-shadow': '0 0 20px rgba(63,185,80,0.35)' },
        '.glow-warning': { 'box-shadow': '0 0 20px rgba(210,153,34,0.35)' },
      })
    }
  ],
};
export default config;
