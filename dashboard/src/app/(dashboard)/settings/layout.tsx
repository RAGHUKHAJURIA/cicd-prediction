'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const tabs = [
    { name: 'General', href: '/settings/general' },
    { name: 'Integrations', href: '/settings/integrations' },
    { name: 'GitHub App', href: '/settings/github-app' },
    { name: 'Notifications', href: '/settings/notifications' },
    { name: 'Danger Zone', href: '/settings/danger' },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg mb-4">Settings</h1>
        
        <div className="flex border-b border-border overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  "px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
                  isActive 
                    ? "text-fg border-b-2 border-accent" 
                    : "text-fg-muted hover:text-fg hover:border-b-2 hover:border-border"
                )}
              >
                {tab.name}
              </Link>
            );
          })}
        </div>
      </div>
      
      <div className="py-2">
        {children}
      </div>
    </div>
  );
}
