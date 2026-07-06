'use client';

import { useState, useEffect } from 'react';
import { InstallationStatus } from './installation-status';
import { AutoPRToggle } from './auto-pr-toggle';
import { GitBranch, Shield, Sparkles, HelpCircle } from 'lucide-react';

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

interface InstallationDetail {
  id: number;
  account: string;
  repoCount: number;
  repos: RepoConfig[];
}

export function GitHubAppSettings() {
  const [setup, setSetup] = useState<{ installUrl: string; appSlug: string; configured: boolean } | null>(null);
  const [installInfo, setInstallInfo] = useState<{ installed: boolean; installations: InstallationDetail[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      const setupRes = await fetch(`${apiUrl}/api/github-app/setup`);
      const setupData = await setupRes.json();
      setSetup(setupData);

      const instRes = await fetch(`${apiUrl}/api/github-app/installation`, { credentials: 'include' });
      if (instRes.ok) {
        const instData = await instRes.json();
        setInstallInfo(instData);
      } else if (instRes.status === 401) {
        setError('Authentication required. Please sign in to configure integration.');
      } else {
        setError('Failed to load GitHub App installation details.');
      }
    } catch (e) {
      console.error(e);
      setError('A network error occurred while loading settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleInstallClick = () => {
    if (setup?.installUrl) {
      window.location.href = setup.installUrl;
    }
  };

  const handleRepoUpdate = (updatedRepo: RepoConfig) => {
    if (!installInfo) return;
    
    const updatedInstallations = installInfo.installations.map(inst => {
      if (inst.id === updatedRepo.installationId) {
        return {
          ...inst,
          repos: inst.repos.map(r => r.githubRepoId === updatedRepo.githubRepoId ? updatedRepo : r)
        };
      }
      return inst;
    });

    setInstallInfo({
      ...installInfo,
      installations: updatedInstallations
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-fg-muted space-y-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Checking integration status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger-subtle/10 border border-danger-subtle/30 rounded-2xl p-6 text-center text-danger max-w-xl mx-auto space-y-3">
        <h4 className="font-bold text-lg">Configuration Error</h4>
        <p className="text-sm text-fg-muted">{error}</p>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 bg-canvas border border-border text-fg rounded-xl text-xs font-semibold hover:border-accent/40"
        >
          Retry
        </button>
      </div>
    );
  }

  const isInstalled = Boolean(installInfo?.installed);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <InstallationStatus
        installed={isInstalled}
        appSlug={setup?.appSlug || 'cicd-reliability'}
        installUrl={setup?.installUrl || ''}
        onInstallClick={handleInstallClick}
      />

      {isInstalled && installInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-lg font-bold text-fg">Active Installations</h3>
            <span className="text-xs text-fg-muted font-mono bg-canvas-subtle border border-border px-2 py-0.5 rounded-md">
              {installInfo.installations.length} Account(s)
            </span>
          </div>

          {installInfo.installations.map((inst) => (
            <div key={inst.id} className="bg-canvas-subtle border border-border rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-base text-fg">@{inst.account}</h4>
                  <p className="text-xs text-fg-muted mt-0.5">{inst.repoCount} repositories authorized</p>
                </div>
              </div>

              {inst.repos.length > 0 ? (
                <div className="space-y-4">
                  {inst.repos.map((repo) => (
                    <AutoPRToggle
                      key={repo.id}
                      repo={repo}
                      onUpdate={handleRepoUpdate}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 bg-canvas border border-dashed border-border rounded-xl text-fg-muted text-sm">
                  No repositories configured. Click "Configure App" to grant repository access.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Guide section */}
      <div className="bg-canvas border border-border rounded-2xl p-6 space-y-4">
        <h4 className="font-bold text-fg text-sm flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-accent" /> Integration Guide & Options
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <h5 className="font-semibold text-fg flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-accent" /> Auto Scanning
            </h5>
            <p className="text-xs text-fg-muted leading-relaxed">
              Whenever you push commits to any branch or update a Pull Request, the app checks for pipeline edits and initiates an automated analysis.
            </p>
          </div>
          <div className="space-y-2">
            <h5 className="font-semibold text-fg flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-success" /> Auto PR Fixes
            </h5>
            <p className="text-xs text-fg-muted leading-relaxed">
              If safe automated fixes are generated, the bot will automatically apply them to a patch branch and open a PR against your base branch.
            </p>
          </div>
          <div className="space-y-2">
            <h5 className="font-semibold text-fg flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-warning" /> Check Gating
            </h5>
            <p className="text-xs text-fg-muted leading-relaxed">
              Enforce quality controls by setting check run conclusions to fail on risk grades below your selected threshold, blocking merges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default GitHubAppSettings;
