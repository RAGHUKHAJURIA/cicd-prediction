'use client';

import { useRepos } from '@/lib/hooks/use-scan';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Save, ShieldAlert, GitBranch } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

export default function RepoSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;
  const { repos, isLoading } = useRepos();
  const repo = repos.find(r => r.id === repoId);

  const [gateEnabled, setGateEnabled] = useState(false);
  const [blockOnCritical, setBlockOnCritical] = useState(true);
  const [blockGrades, setBlockGrades] = useState({ D: false, F: true });
  const [maxScore, setMaxScore] = useState(75);
  const [isSaving, setIsSaving] = useState(false);

  // In a real app, fetch these from API. For now, we mock.
  useEffect(() => {
    if (repo) {
      // Mock loading state
      setGateEnabled(true);
    }
  }, [repo]);

  if (isLoading || !repo) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API call to save gate config
      await new Promise(r => setTimeout(r, 1000));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade-in">
      <button 
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg mb-1">Repository Settings</h1>
        <div className="text-sm text-fg-muted font-mono">{repo.owner} / {repo.repoName}</div>
      </div>

      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden mb-8">
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-canvas rounded-md border border-border flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-fg" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">Deployment Gates</h2>
              <p className="text-sm text-fg-muted mt-1 max-w-xl">
                Automatically block pull requests from merging if they violate reliability policies. Requires the GitHub App to be installed.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={gateEnabled} onChange={e => setGateEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-canvas-inset peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-border"></div>
          </label>
        </div>

        {gateEnabled && (
          <div className="p-6 bg-canvas space-y-6 animate-fade-in">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-fg uppercase tracking-wider">Blocking Conditions</h3>
              
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-border rounded-md hover:bg-canvas-subtle transition-colors">
                <input 
                  type="checkbox" 
                  checked={blockOnCritical}
                  onChange={e => setBlockOnCritical(e.target.checked)}
                  className="rounded bg-canvas-inset border-border text-accent focus:ring-accent w-4 h-4" 
                />
                <div>
                  <div className="text-sm font-medium text-fg">Block on ANY Critical findings</div>
                  <div className="text-xs text-fg-muted">PR will fail the check run if even 1 critical issue is found.</div>
                </div>
              </label>

              <div className="p-3 border border-border rounded-md">
                <div className="text-sm font-medium text-fg mb-3">Block by Risk Grade</div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" disabled className="rounded bg-canvas-inset border-border opacity-50" />
                    <span className="text-sm text-fg-muted">Grade A/B/C</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={blockGrades.D} 
                      onChange={e => setBlockGrades(p => ({...p, D: e.target.checked}))}
                      className="rounded bg-canvas-inset border-border text-accent focus:ring-accent" 
                    />
                    <span className="text-sm text-fg">Grade D</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={blockGrades.F} 
                      onChange={e => setBlockGrades(p => ({...p, F: e.target.checked}))}
                      className="rounded bg-canvas-inset border-border text-accent focus:ring-accent" 
                    />
                    <span className="text-sm text-fg">Grade F</span>
                  </label>
                </div>
              </div>

              <div className="p-3 border border-border rounded-md">
                <div className="text-sm font-medium text-fg mb-3 flex justify-between">
                  <span>Block by Max Risk Score</span>
                  <span className="font-mono text-accent">{maxScore}/100</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={maxScore}
                  onChange={e => setMaxScore(Number(e.target.value))}
                  className="w-full accent-accent" 
                />
                <div className="flex justify-between text-xs text-fg-muted mt-2">
                  <span>0 (Perfect)</span>
                  <span>100 (Worst)</span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border flex justify-end">
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
