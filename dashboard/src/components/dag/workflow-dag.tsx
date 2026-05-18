'use client';

import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState, Panel } from 'reactflow';
import 'reactflow/dist/style.css';
import { NormalizedWorkflow, Finding } from '@/lib/types';
import { useMemo, useEffect } from 'react';
import { buildDAGLayout } from './dag-layout';
import { DagNode } from './dag-node';

const nodeTypes = {
  jobNode: DagNode,
};

interface WorkflowDagProps {
  workflow: NormalizedWorkflow;
  findings: Finding[];
}

export function WorkflowDag({ workflow, findings }: WorkflowDagProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: initialNodes, edges: initialEdges } = buildDAGLayout(workflow, findings);
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [workflow, findings, setNodes, setEdges]);

  return (
    <div className="w-full h-full bg-canvas relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={1.5}
        className="[&_.react-flow\_\_background]:bg-canvas [&_.react-flow\_\_controls_button]:bg-canvas-subtle [&_.react-flow\_\_controls_button]:border-border [&_.react-flow\_\_controls_button]:text-fg [&_.react-flow\_\_controls_button:hover]:bg-canvas-inset"
      >
        <Background color="#30363d" gap={16} size={1} />
        <Controls showInteractive={false} className="shadow-lg border border-border overflow-hidden rounded-md" />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.data?.worstSeverity) {
              case 'critical': return '#f85149';
              case 'high': return '#db6d28';
              case 'medium': return '#d29922';
              case 'low': return '#58a6ff';
              default: return '#30363d';
            }
          }}
          maskColor="rgba(1, 4, 9, 0.7)"
          className="bg-canvas-inset border border-border shadow-lg rounded-md"
        />

        <Panel position="top-right" className="bg-canvas-subtle border border-border rounded-md p-4 shadow-lg text-xs w-48">
          <h4 className="font-semibold text-fg mb-3 uppercase tracking-wider">Legend</h4>
          <div className="space-y-2 text-fg-muted">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-success shrink-0" /> Healthy
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-warning shrink-0" /> Warnings
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-danger shadow-[0_0_5px_rgba(248,81,73,0.8)] shrink-0" /> Critical issues
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              <div className="w-4 h-0.5 bg-border shrink-0" /> Standard path
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-border flex overflow-hidden shrink-0">
                <div className="w-1 h-full bg-border mr-1" />
                <div className="w-1 h-full bg-border mr-1" />
                <div className="w-1 h-full bg-border" />
              </div> 
              Critical path
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-danger shrink-0" /> Cyclic dep
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
