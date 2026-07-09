'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { User, Mail, Shield, CheckCircle2, AlertCircle, Key, Plus } from 'lucide-react';

export default function GeneralSettingsPage() {
  const { user, mutate } = useAuth();
  const [username, setUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsSaving(true);
    setSaveStatus(null);
    setErrorMessage('');

    try {
      await apiClient.request('PATCH', '/api/auth/me', {
        username: username.trim(),
      });
      await mutate();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Account Profile Card */}
      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-fg">Account Profile</h2>
          <p className="text-sm text-fg-muted mt-1">
            Update your public profile and user configurations.
          </p>
        </div>

        <form onSubmit={handleSaveProfile} className="p-6 bg-canvas/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-muted">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-canvas-inset border border-border rounded-md text-sm text-fg focus:outline-none focus:border-accent"
                  placeholder="Username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
                Email Address (Read-only)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-muted">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full pl-9 pr-3 py-2 bg-canvas border border-border rounded-md text-sm text-fg-muted cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
                Role (System Managed)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-muted">
                  <Shield className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={user?.role ? user.role.toUpperCase() : ''}
                  disabled
                  className="w-full pl-9 pr-3 py-2 bg-canvas border border-border rounded-md text-sm text-fg-muted cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving || !username || username === user?.username}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
            >
              {isSaving ? 'Saving Changes...' : 'Save Profile'}
            </button>

            {saveStatus === 'success' && (
              <span className="text-success text-sm flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Profile updated successfully!
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-danger text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {errorMessage}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Personal API Tokens Card */}
      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-fg">Personal API Tokens</h2>
            <p className="text-sm text-fg-muted mt-1">
              Manage developer tokens to access the CI/CD Agent CLI and prediction API.
            </p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-canvas-inset hover:bg-border-muted border border-border text-fg text-xs font-semibold rounded-md transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span>Generate New Token</span>
          </button>
        </div>

        <div className="p-6 bg-canvas/30 space-y-4">
          <div className="border border-border rounded-lg overflow-hidden bg-canvas-inset">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-border text-fg-muted font-semibold uppercase tracking-wider">
                  <th className="p-3">Name</th>
                  <th className="p-3">Scope</th>
                  <th className="p-3">Last Used</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-fg-subtle">
                <tr className="hover:bg-canvas-subtle/30 transition-colors">
                  <td className="p-3 flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-accent" />
                    <span>cli-default-token</span>
                  </td>
                  <td className="p-3">
                    <span className="bg-canvas border border-border px-1.5 py-0.5 rounded text-[10px] text-fg-muted">
                      repo:read, scan:trigger
                    </span>
                  </td>
                  <td className="p-3">2 hours ago</td>
                  <td className="p-3">Jul 09, 2026</td>
                  <td className="p-3 text-right">
                    <button className="text-danger hover:text-danger-hover hover:underline">Revoke</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
