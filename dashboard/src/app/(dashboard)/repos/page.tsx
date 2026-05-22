'use client';

import { useRepos, useQueueStats } from '@/lib/hooks/use-scan';
import { RepoCard } from '@/components/repos/repo-card';
import { AddRepoModal } from '@/components/repos/add-repo-modal';
import { useState, useMemo } from 'react';
import { Search, Plus, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function ReposPage() {
  const { repos, isLoading } = useRepos();
  const { stats } = useQueueStats();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredRepos = useMemo(() => {
    if (!search) return repos;
    return repos.filter(r => r.repoName.toLowerCase().includes(search.toLowerCase()) || r.owner.toLowerCase().includes(search.toLowerCase()));
  }, [repos, search]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 text-accent animate-spin" />
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 text-center relative overflow-hidden bg-canvas">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />
        
        <div className="max-w-md w-full relative z-10 space-y-6 bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center animate-pulse-slow">
            <Sparkles className="w-8 h-8 text-accent" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">No Scanned Repositories</h2>
            <p className="text-xs text-fg-muted leading-relaxed">
              Get started by scanning a public or private repository URL using our AI-powered reliability engine. 
              We'll analyze your CI/CD files and generate instant fixes.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Link
              href="/analyze"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-semibold shadow-[0_0_20px_rgba(31,111,235,0.25)] hover:scale-[1.01] transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Analyze Repo URL
            </Link>
            
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] text-fg-muted hover:text-fg rounded-xl text-xs font-semibold transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Repository directly
            </button>
          </div>
        </div>
        <AddRepoModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
      </div>
    );
  }

  const activeScans = (stats?.scanQueue.active || 0) + (stats?.analysisQueue.active || 0);
  
  // Aggregate stats
  let totalFindings = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  repos.forEach(r => {
    if (r.latestScan) {
      totalFindings += r.latestScan.totalFindings;
      scoreSum += r.latestScan.riskScore;
      scoredCount++;
    }
  });
  
  const avgScore = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0;
  let avgGrade = 'A';
  if (avgScore >= 25 && avgScore < 50) avgGrade = 'B';
  else if (avgScore >= 50 && avgScore < 75) avgGrade = 'C';
  else if (avgScore >= 75 && avgScore < 90) avgGrade = 'D';
  else if (avgScore >= 90) avgGrade = 'F';

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-fg">Repositories</h1>
          <span className="bg-canvas-subtle border border-border text-fg text-xs px-2 py-0.5 rounded-full font-medium">
            {repos.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              placeholder="Find a repository..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-canvas-inset border border-border rounded-md text-sm text-fg focus:outline-none focus:border-accent w-64"
            />
          </div>
          <Link
            href="/analyze"
            className="flex items-center gap-2 px-4 py-1.5 border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] hover:bg-white/[0.04] text-fg-muted hover:text-fg rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-accent animate-pulse-slow" />
            Quick Analyze
          </Link>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add repository
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-canvas-subtle border border-border border-l-4 border-l-accent rounded-md p-4">
          <div className="text-3xl font-light text-fg mb-1">{repos.length}</div>
          <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Total Repos</div>
        </div>
        <div className="bg-canvas-subtle border border-border border-l-4 border-l-blue-400 rounded-md p-4">
          <div className="text-3xl font-light text-fg mb-1">{activeScans}</div>
          <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Active Scans</div>
        </div>
        <div className="bg-canvas-subtle border border-border border-l-4 border-l-warning rounded-md p-4">
          <div className="text-3xl font-light text-fg mb-1">{totalFindings}</div>
          <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Total Findings</div>
        </div>
        <div className="bg-canvas-subtle border border-border border-l-4 border-l-success rounded-md p-4">
          <div className="text-3xl font-light text-fg mb-1">{avgGrade} <span className="text-lg text-fg-muted">({avgScore}/100)</span></div>
          <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Avg Risk Grade</div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredRepos.map(repo => (
          <RepoCard key={repo.id} repo={repo} />
        ))}
        {filteredRepos.length === 0 && (
          <div className="col-span-full py-12 text-center text-fg-muted">
            No repositories found matching "{search}".
          </div>
        )}
      </div>

      <AddRepoModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
