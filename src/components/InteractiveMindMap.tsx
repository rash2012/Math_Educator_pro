import React, { useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  ConnectionLineType,
  Panel,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { MathRenderer } from './MathRenderer';

// Custom Node Design matching the requested palette
const nodeColors: Record<string, string> = {
  root: 'from-indigo-600 to-indigo-800 border-indigo-400 shadow-indigo-500/50',
  concept: 'from-blue-600 to-blue-800 border-blue-400',
  theorem: 'from-emerald-600 to-emerald-800 border-emerald-400',
  algorithm: 'from-violet-600 to-violet-800 border-violet-400',
  warning: 'from-amber-500 to-red-600 border-red-400'
};

const CustomMindmapNode = ({ data }: { data: any }) => {
  const type = data.type || 'concept';
  const colorClasses = nodeColors[type] || nodeColors.concept;
  
  return (
    <div className={`px-5 py-3 rounded-2xl border-2 shadow-lg bg-gradient-to-br ${colorClasses} text-white min-w-[200px] max-w-[300px] text-center`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="font-bold text-sm" style={{ direction: 'rtl' }}>
         <MathRenderer content={data.label} />
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const nodeTypes = {
  customMindmap: CustomMindmapNode,
};

function parseTreeToFlow(tree: any) {
  const nodes: any[] = [];
  const edges: any[] = [];
  let idCounter = 1;

  function traverse(node: any, parentId: string | null = null) {
    if (!node) return;
    const currentId = node.id || `n${idCounter++}`;
    nodes.push({
      id: currentId,
      type: 'customMindmap',
      data: { label: node.label, type: node.type },
      position: { x: 0, y: 0 } // layouted later
    });

    if (parentId) {
      edges.push({
        id: `e-${parentId}-${currentId}`,
        source: parentId,
        target: currentId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#94a3b8',
        },
      });
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any) => traverse(child, currentId));
    }
  }
  
  traverse(tree);
  return { initialNodes: nodes, initialEdges: edges };
}

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // A rough estimate of node size
  const nodeWidth = 250;
  const nodeHeight = 80;
  
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 100 });
  
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  
  dagre.layout(dagreGraph);
  
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });
  
  return { nodes, edges };
};

export const InteractiveMindMap = ({ treeData }: { treeData: any }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (treeData) {
      const { initialNodes, initialEdges } = parseTreeToFlow(treeData);
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges,
        'TB'
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [treeData, setNodes, setEdges]);

  if (!treeData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        البيانات غير صالحة للعرض التفاعلي
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[500px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        connectionLineType={ConnectionLineType.SmoothStep}
      >
        <Background color="#1e293b" gap={20} />
        <Controls className="bg-slate-800 fill-white text-white border-slate-700" />
      </ReactFlow>
    </div>
  );
};
