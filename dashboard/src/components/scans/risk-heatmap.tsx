'use client';

import { Finding } from '@/lib/types';
import * as Tooltip from '@radix-ui/react-tooltip';
import clsx from 'clsx';
import { FileCode, Shield, Zap, Settings, Activity } from 'lucide-react';

interface RiskHeatmapProps {
  findings: Record<string, Finding[]>;
}

const CATEGORIES = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'reliability', label: 'Reliability', icon: Activity },
  { id: 'performance', label: 'Performance', icon: Zap },
  { id: 'maintainability', label: 'Maintainability', icon: Settings },
];

export function RiskHeatmap({ findings }: RiskHeatmapProps) {
  // Extract all unique files
  const files = Object.keys(findings).sort();
  
  if (files.length === 0) {
    return <div className="text-center py-12 text-fg-muted">No findings to display on heatmap.</div>;
  }

  const getWorstSeverity = (fileFindings: Finding[]) => {
    if (fileFindings.some(f => f.severity === 'critical')) return 'critical';
    if (fileFindings.some(f => f.severity === 'high')) return 'high';
    if (fileFindings.some(f => f.severity === 'medium')) return 'medium';
    if (fileFindings.some(f => f.severity === 'low')) return 'low';
    if (fileFindings.some(f => f.severity === 'info')) return 'info';
    return 'none';
  };

  const getCellColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-danger-subtle border-danger glow-danger z-10';
      case 'high': return 'bg-severe-subtle border-severe';
      case 'medium': return 'bg-warning-subtle border-warning';
      case 'low': return 'bg-blue-900/30 border-blue-400';
      case 'info': return 'bg-canvas-inset border-fg-subtle';
      default: return 'bg-canvas-inset border-border border-dashed opacity-50';
    }
  };

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="overflow-x-auto pb-4">
        <div className="inline-block min-w-full align-middle">
          <div className="grid border-t border-l border-border bg-canvas" style={{ gridTemplateColumns: `minmax(250px, 1fr) repeat(${CATEGORIES.length}, minmax(100px, 1fr))` }}>
            
            {/* Header Row */}
            <div className="p-3 border-r border-b border-border bg-canvas-subtle font-semibold text-xs text-fg-muted uppercase tracking-wider flex items-center">
              File
            </div>
            {CATEGORIES.map(cat => (
              <div key={cat.id} className="p-3 border-r border-b border-border bg-canvas-subtle font-semibold text-xs text-fg-muted uppercase tracking-wider flex items-center justify-center gap-2">
                <cat.icon className="w-3.5 h-3.5" />
                {cat.label}
              </div>
            ))}

            {/* Grid Rows */}
            {files.map(file => (
              <div key={file} className="contents group">
                <div className="p-3 border-r border-b border-border text-sm font-mono text-fg-muted flex items-center gap-2 group-hover:bg-canvas-subtle transition-colors truncate">
                  <FileCode className="w-4 h-4 text-accent shrink-0" />
                  <span className="truncate" title={file}>
                    {file.length > 35 ? '...' + file.slice(-35) : file}
                  </span>
                </div>
                
                {CATEGORIES.map(cat => {
                  const cellFindings = findings[file].filter(f => f.category === cat.id);
                  const worstSev = getWorstSeverity(cellFindings);
                  const cellColor = getCellColor(worstSev);

                  return (
                    <Tooltip.Root key={`${file}-${cat.id}`}>
                      <Tooltip.Trigger asChild>
                        <div className="p-2 border-r border-b border-border flex items-center justify-center group-hover:bg-canvas-subtle transition-colors">
                          <div className={clsx(
                            "w-full h-8 rounded-sm border transition-transform hover:scale-110",
                            cellColor
                          )} />
                        </div>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content 
                          className="bg-canvas border border-border rounded-md shadow-xl p-3 z-50 max-w-sm animate-fade-in"
                          sideOffset={5}
                        >
                          <div className="text-xs font-semibold text-fg mb-2">
                            {cellFindings.length} findings in {cat.label}
                          </div>
                          <ul className="text-xs text-fg-muted space-y-1 max-h-32 overflow-y-auto">
                            {cellFindings.slice(0, 3).map(f => (
                              <li key={f.id} className="flex gap-2 truncate">
                                <span className={clsx("w-2 h-2 rounded-full shrink-0 mt-0.5", 
                                  f.severity === 'critical' ? 'bg-danger' :
                                  f.severity === 'high' ? 'bg-severe' :
                                  f.severity === 'medium' ? 'bg-warning' : 'bg-blue-400'
                                )} />
                                <span className="truncate">{f.title}</span>
                              </li>
                            ))}
                            {cellFindings.length > 3 && (
                              <li className="pl-4 italic text-fg-subtle">+{cellFindings.length - 3} more</li>
                            )}
                          </ul>
                          {cellFindings.length === 0 && (
                            <span className="text-xs text-fg-subtle">No findings</span>
                          )}
                          <Tooltip.Arrow className="fill-border" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-fg-muted">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-danger-subtle border border-danger glow-danger"/> Critical</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-severe-subtle border border-severe"/> High</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-warning-subtle border border-warning"/> Medium</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-blue-900/30 border border-blue-400"/> Low</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-canvas-inset border border-border border-dashed opacity-50"/> None</div>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
