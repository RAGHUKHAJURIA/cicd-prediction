'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, LayoutDashboard, GitBranch, Activity, Settings, Plus, ExternalLink } from 'lucide-react';
import { useRepos, useQueueStats } from '@/lib/hooks/use-scan';
import clsx from 'clsx';
import { differenceInHours } from 'date-fns';

export function Sidebar() {
  const pathname = usePathname();
  const { repos } = useRepos();
  const { stats } = useQueueStats();

  const activeJobsCount = (stats?.scanQueue.active || 0) + (stats?.analysisQueue.active || 0) + (stats?.aiQueue.active || 0);

  const links = [
    { name: 'Home', href: '/', icon: LayoutDashboard },
    { name: 'Repositories', href: '/repos', icon: GitBranch },
    { name: 'Queue', href: '/queue', icon: Activity, badge: activeJobsCount > 0 ? activeJobsCount : null },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="w-[260px] my-4 ml-4 rounded-3xl bg-canvas-subtle/40 backdrop-blur-xl border border-white/[0.06] flex flex-col h-[calc(100vh-2rem)] flex-shrink-0 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] z-30">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-4 border-b border-white/[0.06]">
        <ShieldCheck className="text-accent h-6 w-6 mr-2 glow-accent rounded-full" />
        <span className="font-semibold text-white tracking-wide">
          Reliability<span className="text-accent">.io</span>
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-2">
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border',
                isActive
                  ? 'bg-accent/10 border-accent/20 text-white font-semibold shadow-[0_0_12px_rgba(31,111,235,0.15)]'
                  : 'border-transparent text-fg-muted hover:bg-white/[0.04] hover:text-fg'
              )}
            >
              <link.icon className={clsx('h-4 w-4 mr-3', isActive ? 'text-accent' : '')} />
              <span className="flex-1">{link.name}</span>
              {link.badge && (
                <span className="bg-accent text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center">
                  {link.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="mt-8 px-3 mb-2 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-wider text-fg-subtle font-semibold">
            Repositories
          </h3>
        </div>

        <div className="flex flex-col gap-0.5">
          {repos.slice(0, 10).map((repo) => {
            const isActive = pathname.startsWith(`/repos/${repo.id}`);
            const hoursSince = repo.lastScannedAt ? differenceInHours(new Date(), new Date(repo.lastScannedAt)) : null;
            const statusColor = hoursSince === null ? 'bg-fg-subtle' : hoursSince < 1 ? 'bg-success' : hoursSince < 24 ? 'bg-warning' : 'bg-danger';

            return (
              <Link
                key={repo.id}
                href={`/repos/${repo.id}`}
                className={clsx(
                  'flex items-center px-3 py-1.5 rounded-lg text-sm transition-all duration-200 group border border-transparent',
                  isActive 
                    ? 'bg-white/[0.06] border-white/[0.04] text-white font-medium shadow-sm' 
                    : 'text-fg-muted hover:bg-white/[0.04] hover:text-fg'
                )}
              >
                <div className={clsx('h-1.5 w-1.5 rounded-full mr-2', statusColor)} />
                <span className="truncate flex-1 text-[13px]">{repo.repoName}</span>
                {repo.latestScan?.riskGrade && (
                  <span className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded pill border font-bold opacity-0 group-hover:opacity-100 transition-opacity',
                    repo.latestScan.riskGrade === 'A' ? 'text-success border-success-subtle bg-success-subtle/30' :
                    repo.latestScan.riskGrade === 'F' ? 'text-danger border-danger-subtle bg-danger-subtle/30' :
                    'text-fg border-white/[0.08] bg-white/[0.02]'
                  )}>
                    {repo.latestScan.riskGrade}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-2 px-2">
          <Link href="/repos?add=true" className="flex items-center px-2 py-1.5 text-xs text-fg-muted hover:text-fg transition-colors group">
            <Plus className="h-3 w-3 mr-2 group-hover:text-accent transition-colors" />
            Add repository
          </Link>
        </div>
      </div>

      {/* Queue Status (Bottom) */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className={clsx(
          "rounded-xl p-3 border text-sm transition-all duration-300",
          activeJobsCount > 0 
            ? "border-accent/30 bg-accent/10 glow-accent"
            : "border-white/[0.06] bg-white/[0.02]"
        )}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-fg-muted font-medium text-xs uppercase tracking-wide">Queue Status</span>
            {activeJobsCount > 0 && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
            )}
          </div>
          <div className="flex items-center">
            {activeJobsCount > 0 ? (
              <span className="text-fg font-medium animate-pulse-slow text-[13px]">{activeJobsCount} active job{activeJobsCount !== 1 ? 's' : ''}</span>
            ) : (
              <span className="text-fg-subtle text-[13px]">Idle</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-fg-subtle text-xs font-mono">v1.0.0</span>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="text-fg-muted hover:text-fg flex items-center text-xs transition-colors">
            Docs <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </div>
      </div>
    </div>
  );
}
