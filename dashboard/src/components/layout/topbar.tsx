'use client';

import { usePathname } from 'next/navigation';
import { Search, Bell, Play } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

export function Topbar() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const [isScanning, setIsScanning] = useState(false);

  const breadcrumbs = [];
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;
    
    // Formatting basic segments
    let name = segment;
    if (segment === 'repos') name = 'Repositories';
    else if (segment === 'scans') name = 'Scans';
    else if (segment.length > 20) name = `${segment.substring(0, 8)}...`; // Truncate long IDs
    
    breadcrumbs.push({
      name,
      href: currentPath,
      isLast: i === segments.length - 1
    });
  }

  const isRepoPage = segments[0] === 'repos' && segments.length >= 2;
  const currentRepoId = isRepoPage ? segments[1] : null;

  const handleScan = async () => {
    if (!currentRepoId) return;
    setIsScanning(true);
    try {
      await apiClient.triggerScan(currentRepoId);
      // Let SWR handle the refresh
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsScanning(false), 2000); // Fake delay for UX
    }
  };

  return (
    <div className="h-12 bg-canvas border-b border-border flex items-center justify-between px-4 shrink-0 z-10">
      {/* Breadcrumbs */}
      <div className="flex items-center text-sm">
        <Link href="/" className="text-fg-muted hover:text-fg transition-colors">
          Home
        </Link>
        {breadcrumbs.map((crumb) => (
          <div key={crumb.href} className="flex items-center">
            <span className="mx-2 text-fg-subtle">/</span>
            {crumb.isLast ? (
              <span className="text-fg font-medium">{crumb.name}</span>
            ) : (
              <Link href={crumb.href} className="text-fg-muted hover:text-fg transition-colors">
                {crumb.name}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {isRepoPage && (
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300",
              isScanning 
                ? "bg-canvas-subtle text-fg border border-accent animate-pulse glow-accent" 
                : "bg-accent hover:bg-accent-hover text-white border border-white/10"
            )}
          >
            {isScanning ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                Scan now
              </>
            )}
          </button>
        )}
        
        <button className="h-7 w-7 rounded flex items-center justify-center text-fg-muted hover:text-fg hover:bg-canvas-subtle transition-colors border border-transparent">
          <Search className="h-4 w-4" />
        </button>
        
        <button className="h-7 w-7 rounded flex items-center justify-center text-fg-muted hover:text-fg hover:bg-canvas-subtle transition-colors border border-transparent relative">
          <Bell className="h-4 w-4" />
          {/* Mock notification dot */}
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-accent rounded-full border border-canvas" />
        </button>
      </div>
    </div>
  );
}
