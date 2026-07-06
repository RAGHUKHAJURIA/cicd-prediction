'use client';

import { GitHubAppSettings } from '../../../../components/settings/github-app-settings';
import { Suspense } from 'react';

function GitHubAppSettingsContent() {
  return (
    <div className="space-y-6 animate-fade-in px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-2">
        <h1 className="text-3xl font-extrabold text-fg tracking-tight">GitHub App</h1>
        <p className="text-sm text-fg-muted">
          Configure automated pipeline reviews and deployment check gates for your source code.
        </p>
      </div>

      <GitHubAppSettings />
    </div>
  );
}

export default function GitHubAppSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center p-12 text-fg-muted space-y-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Loading settings...</p>
      </div>
    }>
      <GitHubAppSettingsContent />
    </Suspense>
  );
}
