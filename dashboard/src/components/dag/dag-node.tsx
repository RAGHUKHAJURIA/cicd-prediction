// @ts-nocheck
import { Handle, Position } from 'reactflow';
import { Job, Finding } from '@/lib/types';
import clsx from 'clsx';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

interface JobNodeData {
  job: Job;
  findings: Finding[];
  hasFindings: boolean;
  worstSeverity: string;
  isUnreachable: boolean;
  isCyclic: boolean;
}

export function DagNode({ data }: { data: JobNodeData }) {
  const getBorderColor = () => {
    if (data.isCyclic) return 'border-danger glow-danger';
    switch (data.worstSeverity) {
      case 'critical': return 'border-danger glow-danger shadow-[0_0_15px_rgba(248,81,73,0.3)]';
      case 'high': return 'border-severe shadow-[0_0_15px_rgba(219,109,40,0.2)]';
      case 'medium': return 'border-warning';
      case 'low': return 'border-blue-400';
      default: return 'border-border hover:border-fg-subtle';
    }
  };

  const getStatusDot = () => {
    switch (data.worstSeverity) {
      case 'critical': return 'bg-danger shadow-[0_0_5px_rgba(248,81,73,0.8)]';
      case 'high': return 'bg-severe';
      case 'medium': return 'bg-warning';
      case 'none': return 'bg-success';
      default: return 'bg-blue-400';
    }
  };

  const getRunnerText = (env: any) => {
    if (!env || !env.runner) return 'unknown runner';
    if (typeof env.runner === 'string') return env.runner;
    if (Array.isArray(env.runner)) return env.runner[0];
    return 'custom runner';
  };

  return (
    <div className={clsx(
      "w-[240px] bg-canvas-subtle rounded-md transition-all",
      data.isUnreachable ? "border-dashed opacity-50" : "border",
      getBorderColor()
    )}>
      <Handle type="target" position={Position.Left} className="w-2 h-4 rounded-sm bg-border border-0" />
      
      <div className="p-3 border-b border-border/50 bg-canvas/30 rounded-t-md relative overflow-hidden">
        {data.isUnreachable && (
          <div className="absolute inset-0 bg-canvas/80 flex items-center justify-center backdrop-blur-sm z-10">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-wider border border-border px-2 py-0.5 rounded bg-canvas">Unreachable</span>
          </div>
        )}
        {data.isCyclic && (
          <div className="absolute inset-0 bg-danger-subtle/80 flex items-center justify-center backdrop-blur-sm z-10">
            <span className="text-xs font-bold text-danger uppercase tracking-wider border border-danger px-2 py-0.5 rounded bg-danger-subtle flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Cyclic
            </span>
          </div>
        )}
        
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-2 max-w-[85%]">
            <div className={clsx("w-2.5 h-2.5 rounded-full shrink-0", getStatusDot())} />
            <span className="text-sm font-semibold text-fg truncate" title={data.job.name || data.job.id}>{data.job.name || data.job.id}</span>
          </div>
          {data.worstSeverity !== 'none' && (
            <span className={clsx("text-[9px] uppercase font-bold border px-1 rounded-sm", 
              data.worstSeverity === 'critical' ? 'text-danger border-danger' :
              data.worstSeverity === 'high' ? 'text-severe border-severe' :
              data.worstSeverity === 'medium' ? 'text-warning border-warning' : 'text-blue-400 border-blue-400'
            )}>
              {data.worstSeverity[0]}
            </span>
          )}
        </div>
        <div className="text-[10px] font-mono text-fg-muted pl-4.5 truncate">
          runs-on: {getRunnerText(data.job.environment)}
        </div>
      </div>
      
      <div className="p-3 text-xs text-fg-muted flex justify-between items-center bg-canvas-subtle">
        <span>{data.job.steps.length} steps</span>
        {data.job.timeoutMinutes && <span>{data.job.timeoutMinutes}m timeout</span>}
      </div>

      {data.findings.length > 0 && (
        <div className={clsx(
          "p-2 text-xs border-t text-center font-medium",
          data.worstSeverity === 'critical' ? 'border-danger-subtle/30 bg-danger-subtle/10 text-danger' :
          data.worstSeverity === 'high' ? 'border-severe-subtle/30 bg-severe-subtle/10 text-severe' :
          'border-warning-subtle/30 bg-warning-subtle/10 text-warning'
        )}>
          <span className="flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            {data.findings.length} finding{data.findings.length !== 1 && 's'}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-2 h-4 rounded-sm bg-border border-0" />
    </div>
  );
}
