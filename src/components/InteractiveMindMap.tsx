import React, { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  ConnectionLineType,
  MarkerType,
  MiniMap
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  X, 
  ArrowLeftRight, 
  Sparkles, 
  RotateCcw,
  Maximize2
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { 
  normalizeConceptMapData, 
  AdvancedConceptMapData, 
  ConceptNode, 
  CATEGORY_CONFIG, 
  NodeCategory 
} from '../utils/mindmapParser';

// Sleek Minimalist Custom Node matching the golden-navy reference image
const CustomMindmapNode = ({ data }: { data: any }) => {
  const isRoot = data.category === 'root';
  const isSelected = data.isSelected;

  if (isRoot) {
    return (
      <div
        onClick={() => data.onSelect?.(data)}
        className={`relative px-6 py-3.5 rounded-2xl border-2 transition-all cursor-pointer select-none text-center bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black shadow-[0_0_35px_rgba(245,158,11,0.75)] ${
          isSelected ? 'ring-4 ring-amber-200 scale-105 border-white' : 'border-amber-200 hover:scale-102 hover:shadow-[0_0_45px_rgba(245,158,11,0.9)]'
        } min-w-[200px] max-w-[320px] [&_.math-markdown-content]:text-slate-950 [&_.math-markdown-content_p]:text-slate-950 [&_.math-markdown-content_p]:mb-0 [&_.katex]:text-slate-950`}
        style={{ direction: 'rtl' }}
      >
        <Handle
          type="target"
          position={data.direction === 'LR' ? Position.Left : Position.Top}
          className="w-2.5 h-2.5 bg-amber-200 border-2 border-slate-950 rounded-full"
        />

        <div className="text-[14px] md:text-[15px] font-black leading-tight tracking-wide text-slate-950 drop-shadow-xs">
          <MathRenderer content={data.label || 'المفهوم الرئيسي'} className="text-slate-950 font-black [&_p]:mb-0 [&_p]:text-slate-950 [&_.katex]:text-slate-950" />
        </div>

        {data.latex && (
          <div className="mt-1 font-mono text-xs text-slate-950 font-black">
            <MathRenderer content={data.latex} className="text-slate-950 font-black [&_p]:mb-0 [&_p]:text-slate-950 [&_.katex]:text-slate-950" />
          </div>
        )}

        <Handle
          type="source"
          position={data.direction === 'LR' ? Position.Right : Position.Bottom}
          className="w-2.5 h-2.5 bg-amber-200 border-2 border-slate-950 rounded-full"
        />
      </div>
    );
  }

  // Branch & Leaf nodes: Rich deep navy surface with luminous golden glowing border and bright crisp text
  return (
    <div
      onClick={() => data.onSelect?.(data)}
      className={`relative px-4 py-3 rounded-2xl border-2 transition-all cursor-pointer select-none text-center bg-[#0c1427] backdrop-blur-md text-white font-extrabold ${
        isSelected
          ? 'border-amber-300 ring-4 ring-amber-400/80 shadow-[0_0_25px_rgba(251,191,36,0.9)] scale-105'
          : 'border-amber-400/90 shadow-[0_0_16px_rgba(251,191,36,0.45)] hover:shadow-[0_0_25px_rgba(251,191,36,0.7)] hover:border-amber-300 hover:scale-102'
      } min-w-[160px] max-w-[270px] [&_.math-markdown-content]:text-white [&_.math-markdown-content_p]:text-white [&_.math-markdown-content_p]:mb-0 [&_.katex]:text-amber-300`}
      style={{ direction: 'rtl' }}
    >
      <Handle
        type="target"
        position={data.direction === 'LR' ? Position.Left : Position.Top}
        className="w-2.5 h-2.5 bg-amber-400 border border-slate-950 rounded-full"
      />

      <div className="text-[13px] md:text-[14px] font-black text-white leading-snug tracking-wide drop-shadow-sm">
        <MathRenderer content={data.label || 'مفهوم'} className="text-white font-extrabold [&_p]:mb-0 [&_p]:text-white [&_.katex]:text-amber-300" />
      </div>

      {data.latex && (
        <div className="mt-1.5 pt-1 border-t border-slate-800/80 text-center text-amber-300 font-bold text-xs font-mono drop-shadow-sm">
          <MathRenderer content={data.latex} className="text-amber-300 font-bold [&_p]:mb-0 [&_p]:text-amber-300 [&_.katex]:text-amber-300" />
        </div>
      )}

      <Handle
        type="source"
        position={data.direction === 'LR' ? Position.Right : Position.Bottom}
        className="w-2.5 h-2.5 bg-amber-400 border border-slate-950 rounded-full"
      />
    </div>
  );
};

const nodeTypes = {
  customMindmap: CustomMindmapNode,
};

function parseGraphToFlow(
  mapData: AdvancedConceptMapData, 
  onSelectNode: (nodeData: any) => void,
  selectedId: string | null,
  direction: 'TB' | 'LR'
) {
  const nodes: any[] = [];
  const edges: any[] = [];

  mapData.nodes.forEach(node => {
    nodes.push({
      id: node.id,
      type: 'customMindmap',
      data: {
        id: node.id,
        label: node.label,
        category: node.category,
        description: node.description,
        latex: node.latex,
        isSelected: selectedId === node.id,
        direction,
        onSelect: onSelectNode
      },
      position: { x: 0, y: 0 }
    });
  });

  const validNodeIds = new Set(mapData.nodes.map(n => n.id));

  mapData.edges.forEach((edge, idx) => {
    if (validNodeIds.has(edge.from) && validNodeIds.has(edge.to)) {
      edges.push({
        id: `e-${edge.from}-${edge.to}-${idx}`,
        source: edge.from,
        target: edge.to,
        type: 'smoothstep',
        animated: false,
        label: edge.label || '',
        labelStyle: { 
          fill: '#FDE68A', 
          fontWeight: 700, 
          fontSize: 10.5, 
          fontFamily: 'Tajawal, sans-serif' 
        },
        labelBgStyle: { 
          fill: '#081020', 
          fillOpacity: 0.95, 
          stroke: '#D97706', 
          strokeWidth: 1, 
          rx: 6, 
          ry: 6 
        },
        labelBgPadding: [6, 3],
        style: { 
          stroke: '#F59E0B', 
          strokeWidth: 1.8, 
          strokeDasharray: '4 4',
          opacity: 0.85
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#F59E0B',
          width: 12,
          height: 12,
        },
      });
    }
  });

  return { initialNodes: nodes, initialEdges: edges };
}

const getLayoutedElements = (nodes: any[], edges: any[], direction: 'TB' | 'LR' = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  const nodeWidth = 240;
  const nodeHeight = 80;

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: isHorizontal ? 45 : 55,
    ranksep: isHorizontal ? 90 : 80,
    align: 'DL'
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition ? nodeWithPosition.x - nodeWidth / 2 : 0,
        y: nodeWithPosition ? nodeWithPosition.y - nodeHeight / 2 : 0,
      }
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface InteractiveMindMapProps {
  treeData?: any;
  markdownSchema?: string;
  unitTitle?: string;
}

export const InteractiveMindMap: React.FC<InteractiveMindMapProps> = ({
  treeData,
  markdownSchema,
  unitTitle = 'الخريطة الذهنية للوحدة'
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [direction, setDirection] = useState<'TB' | 'LR'>('TB');

  const normalizedMapData = useMemo(() => {
    if (treeData) {
      return normalizeConceptMapData(treeData, unitTitle);
    }
    if (markdownSchema) {
      return normalizeConceptMapData(markdownSchema, unitTitle);
    }
    return normalizeConceptMapData(null, unitTitle);
  }, [treeData, markdownSchema, unitTitle]);

  const handleSelectNode = (nodeData: any) => {
    setSelectedNode(nodeData);
  };

  useEffect(() => {
    if (normalizedMapData) {
      const { initialNodes, initialEdges } = parseGraphToFlow(
        normalizedMapData,
        handleSelectNode,
        selectedNode?.id || null,
        direction
      );
      if (initialNodes.length > 0) {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          initialNodes,
          initialEdges,
          direction
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
    }
  }, [normalizedMapData, selectedNode?.id, direction, setNodes, setEdges]);

  return (
    <div 
      className="w-full h-[640px] relative rounded-2xl overflow-hidden border border-amber-500/20 shadow-2xl flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at center, #0e172e 0%, #060b17 100%)'
      }}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-[#081020]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500/30 shadow-lg">
        <button
          onClick={() => setDirection(d => d === 'TB' ? 'LR' : 'TB')}
          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
          title="تبديل اتجاه التفرع (رأسي / أفقي)"
        >
          <ArrowLeftRight size={13} className="text-amber-400" />
          <span>{direction === 'TB' ? 'عرض رأسي ⬇️' : 'عرض أفقي ⬅️'}</span>
        </button>

        <span className="text-[11px] text-slate-400 font-bold px-1 border-r border-slate-700">
          {normalizedMapData.nodes.length} عقدة
        </span>
      </div>

      {/* Main Flow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.28, maxZoom: 1.3, minZoom: 0.35 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          className="w-full h-full"
        >
          <Background color="#1e293b" gap={28} size={1} />
          <Controls className="bg-[#081020]/90 fill-amber-300 text-amber-300 border-amber-500/30 shadow-xl rounded-xl p-1 [&>button]:border-slate-800 [&>button]:hover:bg-slate-800" />
          <MiniMap
            nodeColor={(n: any) => n?.data?.category === 'root' ? '#F59E0B' : '#38BDF8'}
            maskColor="rgba(6, 11, 23, 0.85)"
            className="bg-[#081020]/95 border border-amber-500/30 rounded-xl overflow-hidden shadow-lg hidden md:block"
          />
        </ReactFlow>

        {/* Selected Node Details Drawer (Clean and unobtrusive) */}
        {selectedNode && (
          <div className="absolute top-4 left-4 z-20 w-72 md:w-84 bg-[#081020]/95 backdrop-blur-md rounded-2xl border border-amber-500/40 p-4 text-white shadow-2xl animate-fade-in text-right">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <span className="text-xs font-black text-amber-300">
                {selectedNode.category === 'root' ? '🌟 المفهوم الرئيسي' : '💡 تفاصيل العقدة'}
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <h4 className="font-extrabold text-sm text-white mb-2 leading-relaxed">
              <MathRenderer content={selectedNode.label} className="text-white font-extrabold [&_p]:mb-0 [&_p]:text-white [&_.katex]:text-amber-300" />
            </h4>

            {selectedNode.latex && (
              <div className="my-2 p-2 bg-[#040812] rounded-xl border border-amber-500/30 text-amber-300 text-center font-mono text-xs">
                <MathRenderer content={selectedNode.latex} className="text-amber-300 font-bold [&_p]:mb-0 [&_p]:text-amber-300 [&_.katex]:text-amber-300" />
              </div>
            )}

            {selectedNode.description && (
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/70 p-2 rounded-xl border border-slate-800">
                {selectedNode.description}
              </p>
            )}

            {/* Connected Relations */}
            <div className="mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
              <span className="font-bold text-amber-400 block mb-1">الروابط المتصلة:</span>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {normalizedMapData.edges
                  .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
                  .map((e, idx) => {
                    const isOutgoing = e.from === selectedNode.id;
                    const otherNodeId = isOutgoing ? e.to : e.from;
                    const otherNode = normalizedMapData.nodes.find(n => n.id === otherNodeId);
                    return (
                      <div key={idx} className="flex items-center gap-1 text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded">
                        <span className={isOutgoing ? 'text-amber-400' : 'text-emerald-400'}>
                          {isOutgoing ? '➔' : '⬅'}
                        </span>
                        {e.label && <span className="text-amber-300 font-semibold">({e.label})</span>}
                        <span className="font-bold text-white truncate">{otherNode?.label || otherNodeId}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom subtle hint */}
        <div className="absolute bottom-3 right-3 z-10 bg-[#081020]/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500/20 text-slate-400 text-[11px] font-medium pointer-events-none">
          ✨ خريطة ذهنية بصرية موجزة • انقر للتفاصيل • اسحب للتنقل
        </div>
      </div>
    </div>
  );
};
