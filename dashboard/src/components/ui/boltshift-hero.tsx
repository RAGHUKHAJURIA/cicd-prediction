'use client';

import { Shield, GitCommit, Search, Sparkles, Activity } from 'lucide-react';

export function BoltshiftHero({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] relative overflow-hidden bg-canvas">
      {/* Background hexagon pattern (simulated with CSS radial gradients) */}
      <div className="absolute inset-0 z-0 opacity-20" style={{
        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(31,111,235,0.1) 0%, transparent 50%)',
        backgroundSize: '100% 100%'
      }} />

      <div className="z-10 text-center max-w-2xl px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
          Your CI/CD Reliability Hub
        </h1>
        <p className="text-fg-muted text-lg mb-10 leading-relaxed max-w-xl mx-auto">
          Harness the power of AI to automate analysis, streamline pipelines,
          and boost your team's efficiency — all in one simple platform.
        </p>

        <div className="flex justify-center gap-4 mb-16 relative">
          <button
            onClick={onAdd}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-all shadow-[0_0_20px_rgba(31,111,235,0.4)]"
          >
            Add your first repository
          </button>
        </div>
      </div>

      {/* Hero Visual Area */}
      <div className="relative w-full max-w-4xl h-[400px] z-10 flex items-center justify-center">
        
        {/* Animated connection lines */}
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <path d="M 200,100 C 350,100 350,200 450,200" fill="none" stroke="url(#blue-grad)" strokeWidth="2" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          <path d="M 200,300 C 350,300 350,200 450,200" fill="none" stroke="url(#blue-grad)" strokeWidth="2" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          <path d="M 700,100 C 550,100 550,200 450,200" fill="none" stroke="url(#blue-grad)" strokeWidth="2" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          <path d="M 700,300 C 550,300 550,200 450,200" fill="none" stroke="url(#blue-grad)" strokeWidth="2" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          
          <defs>
            <linearGradient id="blue-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1f6feb" stopOpacity="0" />
              <stop offset="50%" stopColor="#388bfd" stopOpacity="1" />
              <stop offset="100%" stopColor="#1f6feb" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Central Orb */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-accent/30 bg-canvas-subtle/50 backdrop-blur-sm flex items-center justify-center glow-accent shadow-[inset_0_0_40px_rgba(31,111,235,0.2)] z-20">
          <div className="w-32 h-32 rounded-full border border-accent/50 flex items-center justify-center animate-pulse-slow">
            <Shield className="w-12 h-12 text-accent" />
          </div>
        </div>

        {/* Mini Cards */}
        <div className="absolute top-10 left-10 w-48 p-4 rounded-lg bg-canvas-subtle/80 backdrop-blur border border-border/80 hover:border-accent transition-colors shadow-lg z-20">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-white">16 Rules</span>
          </div>
          <div className="text-xs text-fg-muted">Comprehensive pipeline scanning</div>
        </div>

        <div className="absolute bottom-10 left-10 w-48 p-4 rounded-lg bg-canvas-subtle/80 backdrop-blur border border-border/80 hover:border-accent transition-colors shadow-lg z-20">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-white">Scans</span>
          </div>
          <div className="text-xs text-fg-muted">Real-time DAG analysis</div>
        </div>

        <div className="absolute top-10 right-10 w-48 p-4 rounded-lg bg-canvas-subtle/80 backdrop-blur border border-border/80 hover:border-accent transition-colors shadow-lg z-20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#a371f7]" />
            <span className="text-sm font-medium text-white">AI Analysis</span>
          </div>
          <div className="text-xs text-fg-muted">Context-aware remediation</div>
        </div>

        <div className="absolute bottom-10 right-10 w-48 p-4 rounded-lg bg-canvas-subtle/80 backdrop-blur border border-border/80 hover:border-accent transition-colors shadow-lg z-20">
          <div className="flex items-center gap-2 mb-2">
            <GitCommit className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium text-white">Findings</span>
          </div>
          <div className="text-xs text-fg-muted">Actionable reliability reports</div>
        </div>

      </div>
    </div>
  );
}
