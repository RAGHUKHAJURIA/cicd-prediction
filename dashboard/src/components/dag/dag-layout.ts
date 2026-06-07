// @ts-nocheck
import { NormalizedWorkflow, Job } from '@/lib/types';
import { Node, Edge } from 'reactflow';
import { Finding } from '@/lib/types';

export function buildDAGLayout(workflow: NormalizedWorkflow, allFindings: Finding[]): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Calculate levels using BFS for layout
  const levels = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  const jobs = Object.values(workflow.jobs);
  
  jobs.forEach(job => {
    inDegree.set(job.id, 0);
    adjList.set(job.id, []);
  });

  jobs.forEach(job => {
    job.needs.forEach(dep => {
      if (!adjList.has(dep.jobId)) adjList.set(dep.jobId, []);
      adjList.get(dep.jobId)!.push(job.id);
      inDegree.set(job.id, (inDegree.get(job.id) || 0) + 1);
    });
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current)!;

    adjList.get(current)!.forEach(neighbor => {
      levels.set(neighbor, Math.max(levels.get(neighbor) || 0, currentLevel + 1));
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  // Count nodes per level to center them vertically
  const levelCounts = new Map<number, number>();
  levels.forEach(level => {
    levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
  });

  const currentLevelIndices = new Map<number, number>();

  jobs.forEach(job => {
    const level = levels.get(job.id) || 0;
    const index = currentLevelIndices.get(level) || 0;
    currentLevelIndices.set(level, index + 1);
    
    const countInLevel = levelCounts.get(level) || 1;
    const totalHeight = (countInLevel - 1) * 160; // 120 gap + 40 node height approx
    const startY = -totalHeight / 2;

    const x = level * 320; // 280 width + 40 gap
    const y = startY + index * 160;

    const jobFindings = allFindings.filter(f => f.field.includes(`jobs.${job.id}`) || f.title.includes(job.id));
    let worstSev = 'none';
    if (jobFindings.some(f => f.severity === 'critical')) worstSev = 'critical';
    else if (jobFindings.some(f => f.severity === 'high')) worstSev = 'high';
    else if (jobFindings.some(f => f.severity === 'medium')) worstSev = 'medium';
    else if (jobFindings.some(f => f.severity === 'low')) worstSev = 'low';
    
    // Check if cyclic - simple check: does it need something that needs it? (DAG builder detects this better)
    const isCyclic = false; // Mock for now, would come from backend

    nodes.push({
      id: job.id,
      type: 'jobNode',
      position: { x, y },
      data: {
        job,
        findings: jobFindings,
        hasFindings: jobFindings.length > 0,
        worstSeverity: worstSev,
        isUnreachable: false, // from backend later
        isCritical: worstSev === 'critical',
        isCyclic
      }
    });

    job.needs.forEach(dep => {
      edges.push({
        id: `${dep.jobId}-${job.id}`,
        source: dep.jobId,
        target: job.id,
        type: 'smoothstep',
        animated: worstSev === 'critical' || worstSev === 'high',
        style: {
          stroke: isCyclic ? '#f85149' : '#30363d',
          strokeWidth: 1.5
        },
        markerEnd: {
          type: 'arrowclosed' as any,
          color: isCyclic ? '#f85149' : '#30363d',
        }
      });
    });
  });

  return { nodes, edges };
}
