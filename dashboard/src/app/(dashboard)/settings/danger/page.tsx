'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function DangerZonePage() {
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);

  const handlePurge = () => {
    if (!confirm('Are you sure you want to delete all cached pipeline scan results? This action is irreversible.')) {
      return;
    }
    setIsPurging(true);
    setTimeout(() => {
      setIsPurging(false);
      setPurgeSuccess(true);
      setTimeout(() => setPurgeSuccess(false), 3000);
    }, 1200);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-canvas-subtle border border-danger/20 rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border bg-danger/5">
          <h2 className="text-lg font-semibold text-danger flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Danger Zone
          </h2>
          <p className="text-sm text-fg-muted mt-1">
            Destructive actions that can result in data loss or account termination.
          </p>
        </div>

        <div className="p-6 bg-canvas/30 space-y-6">
          {/* Action 1: Purge scans */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-canvas-inset border border-border">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-white">Purge Scan History</div>
              <p className="text-xs text-fg-muted max-w-xl leading-relaxed">
                Delete all historical scan runs and reliability grade history for all of your registered repositories. This does not remove the repositories themselves.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handlePurge}
                disabled={isPurging}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded bg-danger/15 hover:bg-danger/25 border border-danger/30 text-xs font-semibold text-danger transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isPurging ? 'Purging...' : 'Purge All Scans'}
              </button>
              {purgeSuccess && (
                <span className="text-success text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Purged!
                </span>
              )}
            </div>
          </div>

          {/* Action 2: Delete Account */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-canvas-inset border border-border">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-white">Delete Account</div>
              <p className="text-xs text-fg-muted max-w-xl leading-relaxed">
                Permanently delete your profile account, registered repositories, stored credentials, and all associated scan data. This action cannot be undone.
              </p>
            </div>
            <button
              onClick={() => alert('Account deletion requires contacting the system administrator.')}
              className="inline-flex items-center justify-center shrink-0 h-9 px-4 rounded bg-danger hover:bg-danger-hover text-xs font-semibold text-white transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
