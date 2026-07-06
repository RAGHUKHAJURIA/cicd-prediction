'use client';

import { CheckCircle2, GitPullRequest, ExternalLink, AlertCircle } from 'lucide-react';

interface InstallationStatusProps {
  installed: boolean;
  appSlug: string;
  installUrl: string;
  onInstallClick: () => void;
}

export function InstallationStatus({ installed, appSlug, installUrl, onInstallClick }: InstallationStatusProps) {
  const manageUrl = `https://github.com/settings/apps/${appSlug}/installations`;

  return (
    <div className="bg-canvas-subtle border border-border rounded-2xl p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-5 text-center md:text-left flex-col md:flex-row">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center border shadow-sm transition-all duration-300 ${
          installed 
            ? 'bg-success-subtle/10 border-success-subtle/30 text-success' 
            : 'bg-canvas border-border text-fg-muted'
        }`}>
          <GitPullRequest className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-fg flex items-center justify-center md:justify-start gap-2">
            GitHub App Integration
            {installed && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-subtle/10 text-success border border-success-subtle/20">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            )}
          </h3>
          <p className="text-sm text-fg-muted mt-1 max-w-lg leading-relaxed">
            {installed
              ? 'The bot is connected. Any push or pull request on your repositories containing CI/CD modifications will automatically trigger security, reliability, and AI analysis checks.'
              : 'Add our GitHub App to your account or organization to enable automated branch monitoring, in-place Pull Request diagnostics, and checks-run gating.'}
          </p>
        </div>
      </div>

      <div className="shrink-0 w-full md:w-auto text-center">
        {installed ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 bg-canvas border border-border hover:border-accent/40 text-fg hover:text-accent font-medium rounded-xl transition-all duration-200 inline-flex items-center justify-center gap-2 text-sm shadow-sm"
            >
              Configure App <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onInstallClick}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-all duration-200 inline-flex items-center justify-center gap-2 text-sm shadow-[0_4px_12px_rgba(31,111,235,0.25)]"
            >
              Add to More Repos
            </button>
          </div>
        ) : (
          <button
            onClick={onInstallClick}
            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-all duration-300 inline-flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(31,111,235,0.3)] hover:scale-[1.02] active:scale-[0.98]"
          >
            <GitPullRequest className="w-5 h-5 fill-current" /> Install on GitHub
          </button>
        )}
      </div>
    </div>
  );
}
