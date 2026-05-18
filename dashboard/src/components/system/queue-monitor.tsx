import { QueueInfo } from '@/lib/types';
import { Activity, CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

interface QueueMonitorProps {
  stats: Record<string, QueueInfo>;
  isPolling: boolean;
}

export function QueueMonitor({ stats, isPolling }: QueueMonitorProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const queues = [
    { id: 'scanQueue', label: 'Scan Engine', icon: Activity },
    { id: 'analysisQueue', label: 'Analysis Engine', icon: RefreshCw },
    { id: 'aiQueue', label: 'AI Engine', icon: Clock },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-fg flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" /> System Monitor
        </h2>
        <div className="flex items-center gap-2 text-xs text-fg-muted bg-canvas-inset px-3 py-1.5 rounded-full border border-border">
          <div className={clsx("w-2 h-2 rounded-full", isPolling ? "bg-success animate-pulse shadow-[0_0_5px_rgba(63,185,80,0.8)]" : "bg-fg-muted")} />
          {isPolling ? 'Live Sync Active' : 'Sync Paused'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {queues.map(q => {
          const qStats = stats[q.id];
          if (!qStats) return null;

          const totalActive = qStats.active + qStats.waiting;
          const isBusy = totalActive > 0;

          return (
            <div key={q.id} className={clsx(
              "bg-canvas-subtle border rounded-lg overflow-hidden transition-all duration-500",
              isBusy ? "border-accent glow-accent" : "border-border"
            )}>
              <div className="p-4 border-b border-border bg-canvas flex justify-between items-center">
                <div className="flex items-center gap-2 font-medium text-fg">
                  <q.icon className={clsx("w-4 h-4", isBusy ? "text-accent animate-spin-slow" : "text-fg-muted")} />
                  {q.label}
                </div>
                {isBusy ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">Processing</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted bg-canvas-inset px-2 py-0.5 rounded border border-border">Idle</span>
                )}
              </div>
              
              <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <div className="text-xs text-fg-muted mb-1 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Active</div>
                  <div className="text-3xl font-light text-fg">{qStats.active}</div>
                </div>
                <div>
                  <div className="text-xs text-fg-muted mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Waiting</div>
                  <div className="text-3xl font-light text-fg">{qStats.waiting}</div>
                </div>
                <div>
                  <div className="text-xs text-fg-muted mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success"/> Completed</div>
                  <div className="text-xl font-medium text-success">{qStats.completed}</div>
                </div>
                <div>
                  <div className="text-xs text-fg-muted mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 text-danger"/> Failed</div>
                  <div className="text-xl font-medium text-danger">{qStats.failed}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-canvas-subtle border border-border rounded-lg p-6">
        <h3 className="font-semibold text-fg mb-4">Worker Node Status</h3>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success shadow-[0_0_5px_rgba(63,185,80,0.8)]" />
            <span className="text-fg">Worker-01 (Primary)</span>
          </div>
          <div className="text-fg-muted">CPU: <span className="font-mono text-fg">14%</span></div>
          <div className="text-fg-muted">RAM: <span className="font-mono text-fg">1.2GB</span></div>
          <div className="text-fg-muted">Uptime: <span className="font-mono text-fg">14d 2h</span></div>
        </div>
      </div>
    </div>
  );
}
