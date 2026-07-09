'use client';

import { useState } from 'react';
import { Bell, Mail, MessageSquare, Globe, CheckCircle2 } from 'lucide-react';

export default function NotificationsSettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [slackAlerts, setSlackAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-fg">Notification Preferences</h2>
          <p className="text-sm text-fg-muted mt-1">
            Choose how and when you want to receive risk alerts and scan results.
          </p>
        </div>

        <form onSubmit={handleSave} className="p-6 bg-canvas/30 space-y-6">
          <div className="space-y-4">
            {/* Email Alerts */}
            <div className="flex items-start justify-between p-4 rounded-lg bg-canvas-inset border border-border">
              <div className="flex gap-3">
                <Mail className="w-5 h-5 text-accent mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-white">Email Alerts</div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Receive immediate emails when critical security or reliability issues are detected.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={emailAlerts} 
                  onChange={e => setEmailAlerts(e.target.checked)} 
                />
                <div className="w-11 h-6 bg-canvas-inset peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-border"></div>
              </label>
            </div>

            {/* Slack integration indicator */}
            <div className="flex items-start justify-between p-4 rounded-lg bg-canvas-inset border border-border">
              <div className="flex gap-3">
                <MessageSquare className="w-5 h-5 text-[#2eb043] mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-white">Slack Notifications</div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Forward pipeline scan failures and warnings to Slack webhooks configured in Integrations.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={slackAlerts} 
                  onChange={e => setSlackAlerts(e.target.checked)} 
                />
                <div className="w-11 h-6 bg-canvas-inset peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-border"></div>
              </label>
            </div>

            {/* Weekly Digest */}
            <div className="flex items-start justify-between p-4 rounded-lg bg-canvas-inset border border-border">
              <div className="flex gap-3">
                <Bell className="w-5 h-5 text-purple-400 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-white">Weekly Pipeline Summary</div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Receive a consolidated weekly digest highlighting risk metrics, grade progress, and open warnings.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={weeklyDigest} 
                  onChange={e => setWeeklyDigest(e.target.checked)} 
                />
                <div className="w-11 h-6 bg-canvas-inset peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-border"></div>
              </label>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-3 border-t border-border">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold rounded-md transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </button>
            {saveSuccess && (
              <span className="text-success text-sm flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Preferences saved!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
