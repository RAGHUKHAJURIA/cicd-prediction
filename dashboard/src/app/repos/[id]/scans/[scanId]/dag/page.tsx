'use client';

import { useScan } from '@/lib/hooks/use-scan';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { WorkflowDag } from '@/components/dag/workflow-dag';
import { useMemo, useState } from 'react';

export default function DagPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;
  const scanId = params.scanId as string;
  const { scan, isLoading } = useScan(repoId, scanId);
  const [selectedWorkflowIndex, setSelectedWorkflowIndex] = useState(0);

  const workflows = useMemo(() => {
    if (!scan?.artifacts) return [];
    try {
      // Find artifacts of type 'workflow' that have been parsed
      return scan.artifacts
        .filter(a => a.type === 'workflow')
        .map(a => ({
          path: a.filePath,
          workflow: JSON.parse(a.content)
        }));
    } catch (e) {
      console.error('Failed to parse workflows for DAG', e);
      return [];
    }
  }, [scan]);

  if (isLoading || !scan) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  const activeWorkflow = workflows[selectedWorkflowIndex];

  return (
    <div className="h-full flex flex-col bg-canvas animate-fade-in relative z-50 fixed inset-0 w-full">
      {/* Full screen override by putting it in a fixed container or just letting it fill the space if topbar is excluded */}
      
      <div className="h-14 border-b border-border bg-canvas-subtle flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="p-1.5 hover:bg-canvas rounded-md text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <span className="font-semibold text-fg">Pipeline Visualization</span>
            <span className="text-xs text-fg-muted font-mono">{scan.branch}</span>
          </div>
        </div>

        {workflows.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-muted">File:</span>
            <select
              value={selectedWorkflowIndex}
              onChange={(e) => setSelectedWorkflowIndex(Number(e.target.value))}
              className="bg-canvas border border-border text-sm text-fg rounded-md px-3 py-1.5 focus:outline-none focus:border-accent"
            >
              {workflows.map((wf, idx) => (
                <option key={idx} value={idx}>{wf.path}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 relative">
        {activeWorkflow ? (
          <WorkflowDag workflow={activeWorkflow.workflow} findings={scan.findings?.all || []} />
        ) : (
          <div className="flex items-center justify-center h-full text-fg-muted">
            No valid workflow definitions found in this scan.
          </div>
        )}
      </div>
    </div>
  );
}
