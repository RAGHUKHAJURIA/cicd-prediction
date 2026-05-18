'use client';

import { useState } from 'react';
import { MessageSquare, ShieldCheck, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '@/lib/api-client';

export default function IntegrationsSettingsPage() {
  const [slackWebhook, setSlackWebhook] = useState('');
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

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
