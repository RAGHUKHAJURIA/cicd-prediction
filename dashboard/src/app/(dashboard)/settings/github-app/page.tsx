'use client';

import { GitPullRequest, CheckCircle2, ArrowRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

function GitHubAppSettingsContent() {
  const searchParams = useSearchParams();
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (searchParams.get('installed') === 'true') {
      setIsInstalled(true);
    }
  }, [searchParams]);

  const handleInstall = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/github-app/setup`);
      const { installUrl } = await res.json();
      window.location.href = installUrl;
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-canvas-subtle border border-border rounded-lg p-8 text-center max-w-2xl mx-auto mt-8">
        <div className="w-16 h-16 bg-canvas border border-border rounded-xl flex items-center justify-center mx-auto mb-6 shadow-sm">
          <GitPullRequest className="w-8 h-8 text-fg" />
        </div>
        
        <h2 className="text-2xl font-bold text-fg mb-4">GitHub App Integration</h2>
        <p className="text-fg-muted mb-8 leading-relaxed">
          Install the CI/CD Reliability Intelligence GitHub App to enable automated PR scanning, detailed PR comments, and deployment gating via Check Runs.
        </p>

        {isInstalled ? (
          <div className="bg-success-subtle/20 border border-success-subtle rounded-md p-6 inline-block w-full">
            <div className="flex items-center justify-center gap-2 text-success font-semibold text-lg mb-2">
              <CheckCircle2 className="w-6 h-6" /> App Successfully Installed
            </div>
            <p className="text-sm text-fg-muted">
              The platform is now listening for pull request events. Check runs will be automatically created.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleInstall}
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-colors inline-flex items-center gap-2 shadow-[0_0_15px_rgba(31,111,235,0.3)]"
            >
              <GitPullRequest className="w-5 h-5 fill-current" /> Install on GitHub
            </button>
            <p className="text-xs text-fg-subtle">
              You will be redirected to GitHub to select which repositories to grant access to.
            </p>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        <h3 className="font-semibold text-fg text-lg">What the app does:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-canvas border border-border p-4 rounded-md">
            <h4 className="font-medium text-fg mb-1">Check Runs</h4>
            <p className="text-xs text-fg-muted">Blocks PRs from being merged if critical reliability issues are detected.</p>
          </div>
          <div className="bg-canvas border border-border p-4 rounded-md">
            <h4 className="font-medium text-fg mb-1">PR Comments</h4>
            <p className="text-xs text-fg-muted">Posts a detailed markdown summary of findings directly on your Pull Requests.</p>
          </div>
          <div className="bg-canvas border border-border p-4 rounded-md">
            <h4 className="font-medium text-fg mb-1">Auto-sync</h4>
            <p className="text-xs text-fg-muted">Automatically triggers a background scan whenever new commits are pushed.</p>
          </div>
          <div className="bg-canvas border border-border p-4 rounded-md">
            <h4 className="font-medium text-fg mb-1">Read-only Code Access</h4>
            <p className="text-xs text-fg-muted">Only reads CI/CD configuration files. Does not modify your source code.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GitHubAppSettingsPage() {
  return (
    <Suspense fallback={<div className="text-fg-muted p-4">Loading settings...</div>}>
      <GitHubAppSettingsContent />
    </Suspense>
  );
}
