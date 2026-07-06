'use client';

import { useState } from 'react';
import { ShieldAlert, Sparkles, Activity } from 'lucide-react';

interface RepoConfig {
  id: string;
  installationId: number;
  githubRepoId: number;
  owner: string;
  repoName: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  autoScanEnabled: boolean;
  autoPrEnabled: boolean;
  blockOnGrade: 'D' | 'F' | null;
}

interface AutoPRToggleProps {
  repo: RepoConfig;
  onUpdate: (updatedRepo: RepoConfig) => void;
}

export function AutoPRToggle({ repo, onUpdate }: AutoPRToggleProps) {
  const [loading, setLoading] = useState(false);

  const updateSetting = async (updates: Partial<RepoConfig>) => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/github-app/repos/${repo.installationId}/${repo.githubRepoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
        credentials: 'include'
      });

      if (res.ok) {
        onUpdate({ ...repo, ...updates });
      } else {
        console.error('Failed to update repo settings');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-canvas border border-border hover:border-accent/40 rounded-xl p-6 transition-all duration-300 shadow-sm hover:shadow-[0_4px_20px_rgba(31,111,235,0.08)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg text-base">{repo.repoName}</span>
          {repo.private && (
            <span className="px-2 py-0.5 bg-canvas-subtle border border-border text-fg-subtle text-2xs rounded-full uppercase tracking-wider font-semibold">
              Private
            </span>
          )}
        </div>
        <p className="text-sm text-fg-muted font-mono">{repo.fullName} · branch: {repo.defaultBranch}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 md:gap-6 w-full md:w-auto">
        {/* Toggle Auto Scan */}
        <div className="flex items-center gap-2 bg-canvas-subtle/40 border border-border p-2 rounded-lg">
          <Activity className={`w-4 h-4 ${repo.autoScanEnabled ? 'text-accent' : 'text-fg-subtle'}`} />
          <span className="text-xs font-medium text-fg-muted">Auto Scan</span>
          <button
            onClick={() => updateSetting({ autoScanEnabled: !repo.autoScanEnabled })}
            disabled={loading}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              repo.autoScanEnabled ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                repo.autoScanEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Toggle Auto PR */}
        <div className="flex items-center gap-2 bg-canvas-subtle/40 border border-border p-2 rounded-lg">
          <Sparkles className={`w-4 h-4 ${repo.autoPrEnabled ? 'text-success' : 'text-fg-subtle'}`} />
          <span className="text-xs font-medium text-fg-muted">Auto PR Fixes</span>
          <button
            onClick={() => updateSetting({ autoPrEnabled: !repo.autoPrEnabled })}
            disabled={loading}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              repo.autoPrEnabled ? 'bg-success' : 'bg-border'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                repo.autoPrEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Block on Grade */}
        <div className="flex items-center gap-2 bg-canvas-subtle/40 border border-border p-2 rounded-lg w-full sm:w-auto">
          <ShieldAlert className={`w-4 h-4 ${repo.blockOnGrade ? 'text-warning' : 'text-fg-subtle'}`} />
          <span className="text-xs font-medium text-fg-muted mr-1">Gating</span>
          <select
            value={repo.blockOnGrade || ''}
            onChange={(e) => updateSetting({ blockOnGrade: (e.target.value as any) || null })}
            disabled={loading}
            className="bg-canvas border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-accent font-medium"
          >
            <option value="">No Gating</option>
            <option value="D">Block on D/F</option>
            <option value="F">Block on F Only</option>
          </select>
        </div>
      </div>
    </div>
  );
}
