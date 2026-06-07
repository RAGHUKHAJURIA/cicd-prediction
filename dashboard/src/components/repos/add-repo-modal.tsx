'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, GitPullRequest, GitMerge, GitBranch, Key } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useSWRConfig } from 'swr';
import clsx from 'clsx';

export function AddRepoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate } = useSWRConfig();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [autoScan, setAutoScan] = useState(true);

  const getProviderIcon = () => {
    if (url.includes('gitlab.com')) return <GitMerge className="w-5 h-5" />;
    return <GitPullRequest className="w-5 h-5" />;
  };

  const handleNext = () => {
    if (!url.includes('://')) {
      setError('Please enter a valid repository URL');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.createRepo({
        url,
        branch,
        token: token || undefined,
        autoScanOnPush: autoScan,
      });
      mutate('repos');
      onOpenChange(false);
      // Reset
      setTimeout(() => {
        setStep(1);
        setUrl('');
        setBranch('main');
        setToken('');
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to add repository');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-canvas/80 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-canvas-subtle border border-border rounded-lg shadow-xl w-full max-w-md p-6 z-50 animate-slide-in">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-xl font-semibold text-fg">Add repository</Dialog.Title>
            <Dialog.Close className="text-fg-muted hover:text-fg transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {step === 1 ? (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-fg mb-1">Repository URL</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-fg-muted">
                    {getProviderIcon()}
                  </div>
                  <input
                    type="text"
                    className={clsx(
                      "block w-full pl-10 pr-3 py-2 bg-canvas-inset border rounded-md text-sm text-fg placeholder-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all",
                      error ? "border-danger" : "border-border"
                    )}
                    placeholder="https://github.com/owner/repo"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  />
                </div>
                {error && <p className="text-danger text-xs mt-1">{error}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <Dialog.Close className="px-4 py-2 text-sm text-fg-muted hover:text-fg bg-canvas hover:bg-canvas-subtle border border-border rounded-md transition-colors">
                    Cancel
                  </Dialog.Close>
                  <button
                    onClick={handleNext}
                    disabled={!url}
                    className="px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded-md disabled:opacity-50 transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <div className="animate-fade-in space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">Default Branch</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-fg-muted">
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      className="block w-full pl-10 pr-3 py-2 bg-canvas-inset border border-border rounded-md text-sm text-fg focus:outline-none focus:border-accent"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg mb-1">Personal Access Token (Optional)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-fg-muted">
                      <Key className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      className="block w-full pl-10 pr-3 py-2 bg-canvas-inset border border-border rounded-md text-sm text-fg focus:outline-none focus:border-accent"
                      placeholder="Required for private repos"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-fg-muted mt-1">Leave blank if the repository is public or uses a global App installation.</p>
                </div>

                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScan}
                    onChange={(e) => setAutoScan(e.target.checked)}
                    className="rounded bg-canvas-inset border-border text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-fg">Auto-scan on push</span>
                </label>

                {error && <p className="text-danger text-xs">{error}</p>}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="px-4 py-2 text-sm text-fg-muted hover:text-fg bg-canvas hover:bg-canvas-subtle border border-border rounded-md transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded-md disabled:opacity-50 transition-colors"
                  >
                    {isLoading && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                    Add repository
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
