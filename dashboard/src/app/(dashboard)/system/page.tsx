'use client';

import { useQueueStats } from '@/lib/hooks/use-scan';
import { QueueMonitor } from '@/components/system/queue-monitor';
import { Loader2 } from 'lucide-react';

export default function SystemPage() {
  const { stats, isLoading, isValidating } = useQueueStats();

  if (isLoading && !stats) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <QueueMonitor stats={stats || {}} isPolling={isValidating} />
    </div>
  );
}
