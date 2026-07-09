'use client';

import { useState } from 'react';
import { MessageSquare, ShieldCheck, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/hooks/use-auth';

export default function IntegrationsSettingsPage() {
  const { user } = useAuth();
  const [slackWebhook, setSlackWebhook] = useState('');
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const githubRepoAuthUrl = `${apiBaseUrl}/auth/github?scope=repo&redirect=${encodeURIComponent(currentUrl)}`;
  const githubBasicAuthUrl = `${apiBaseUrl}/auth/github?redirect=${encodeURIComponent(currentUrl)}`;
  const githubAppUrl = 'https://github.com/apps/ci-cd-reliability-platform/installations/new';

  const handleTestSlack = async () => {
    if (!slackWebhook) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      // Very simple test call
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/slack/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: slackWebhook })
      });
      if (res.ok) {
        setTestResult('success');
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* GitHub Integration */}
      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-canvas rounded-md border border-border flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-fg fill-current" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.35 3.12.88.01.64.01 1.25.01 1.42 0 .21-.15.47-.55.38A8.006 8.006 0 0 1 0 8c0-4.42 3.58-8 8-8z"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">GitHub Connection</h2>
              <p className="text-sm text-fg-muted mt-1 max-w-xl">
                Connect your GitHub account to import repositories, trigger automated workflow checks, and apply reliability fixes directly.
              </p>
            </div>
          </div>
          {user?.githubUsername ? (
            <span className="flex items-center gap-1.5 text-xs text-success bg-success/5 border border-success/20 px-2.5 py-1 rounded-full font-medium h-fit">
              <Check className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted bg-canvas border border-border px-2.5 py-1 rounded-full font-medium h-fit">
              Not Connected
            </span>
          )}
        </div>

        <div className="p-6 bg-canvas/30 space-y-6">
          {/* OAuth block */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-canvas-inset border border-border">
            <div className="space-y-1">
              <div className="text-sm font-medium text-white">
                {user?.githubUsername ? `Connected as @${user.githubUsername}` : 'Personal GitHub Account'}
              </div>
              <p className="text-xs text-fg-muted max-w-xl leading-relaxed">
                {user?.githubUsername 
                  ? 'To allow the platform to commit fixed workflow files and create pull requests on your behalf, you need to authorize repository write access.' 
                  : 'Connect your personal GitHub account to authorize repository import and code analysis.'}
              </p>
            </div>
            <a
              href={user?.githubUsername ? githubRepoAuthUrl : githubBasicAuthUrl}
              className="inline-flex items-center justify-center shrink-0 h-9 px-4 rounded bg-accent hover:bg-accent-hover text-xs font-semibold text-white transition-colors"
            >
              {user?.githubUsername ? 'Grant Repository Access ↗' : 'Connect Account ↗'}
            </a>
          </div>

          {/* App block */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-canvas-inset border border-border">
            <div className="space-y-1">
              <div className="text-sm font-medium text-white">GitHub App Integration</div>
              <p className="text-xs text-fg-muted max-w-xl leading-relaxed">
                Install our official GitHub App on your organization or repositories to enable automated pull-request status checks and push-triggered analysis.
              </p>
            </div>
            <a
              href={githubAppUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center shrink-0 h-9 px-4 rounded bg-canvas-subtle hover:bg-border-muted border border-border text-xs font-semibold text-fg hover:text-white transition-colors"
            >
              Install GitHub App ↗
            </a>
          </div>
        </div>
      </div>

      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-canvas rounded-md border border-border flex items-center justify-center shrink-0">
              <MessageSquare className="w-6 h-6 text-fg" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">Slack Notifications</h2>
              <p className="text-sm text-fg-muted mt-1 max-w-xl">
                Receive alerts in your Slack channels when pipeline risk grades degrade or critical issues are found.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={slackEnabled} onChange={e => setSlackEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-canvas-inset peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-border"></div>
          </label>
        </div>
        
        {slackEnabled && (
          <div className="p-6 bg-canvas space-y-4 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-fg mb-1">Webhook URL</label>
              <input
                type="text"
                placeholder="https://hooks.slack.com/services/..."
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                className="w-full max-w-lg px-3 py-2 bg-canvas-inset border border-border rounded-md text-sm text-fg focus:outline-none focus:border-accent"
              />
            </div>
            
            <div className="space-y-2 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded bg-canvas-inset border-border text-accent focus:ring-accent" />
                <span className="text-sm text-fg">Alert on new Critical findings</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded bg-canvas-inset border-border text-accent focus:ring-accent" />
                <span className="text-sm text-fg">Alert on Risk Grade degradation</span>
              </label>
            </div>

            <div className="pt-4 flex items-center gap-3">
              <button 
                onClick={handleTestSlack}
                disabled={isTesting || !slackWebhook}
                className="px-4 py-2 bg-canvas-subtle hover:bg-border-muted border border-border text-fg text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              {testResult === 'success' && <span className="text-success text-sm flex items-center gap-1"><Check className="w-4 h-4"/> Success</span>}
              {testResult === 'error' && <span className="text-danger text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Failed</span>}
            </div>
          </div>
        )}
      </div>

      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="p-6 flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-canvas rounded-md border border-border flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-fg" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">Jira / Linear (Coming Soon)</h2>
              <p className="text-sm text-fg-muted mt-1 max-w-xl">
                Automatically create tickets for new critical pipeline issues.
              </p>
            </div>
          </div>
          <button disabled className="px-4 py-2 bg-canvas-inset border border-border text-fg-muted text-sm font-medium rounded-md cursor-not-allowed">
            Coming Soon
          </button>
        </div>
      </div>
    </div>
  );
}
