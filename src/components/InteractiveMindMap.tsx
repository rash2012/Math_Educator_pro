import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  X, 
  ArrowUpDown, 
  ArrowLeftRight, 
  Sparkles, 
  RotateCcw,
  Maximize2,
  Smartphone,
  Layers,
  ZoomIn,
  ZoomOut,
  Focus,
  Info
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { 
  normalizeConceptMapData, 
  AdvancedConceptMapData, 
  ConceptNode, 
  CATEGORY_CONFIG, 
  NodeCategory 
} from '../utils/mindmapParser';

// Sleek Minimalist Custom Node matching the golden-navy reference image with mobile responsiveness
const CustomMindmapNode = ({ data }: { data: any }) => {
  const isRoot = data.category === 'root';
  const isSelected = data.isSelected;
  const isVertical = data.direction === 'TB';
  const categoryCfg = CATEGORY_CONFIG[data.category as NodeCategory] || CATEGORY_CONFIG.concept;

  if (isRoot) {
    return (
      <div
        onClick={() => data.onSelect?.(data)}
        className={`relative px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl border-2 transition-all cursor-pointer select-none text-center bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black shadow-[0_0_30px_rgba(245,158,11,0.65)] ${
          isSelected 
            ? 'ring-4 ring-amber-200 scale-105 border-white shadow-[0_0_40px_rgba(245,158,11,0.9)]' 
            : 'border-amber-200 hover:scale-102 hover:shadow-[0_0_35px_rgba(245,158,11,0.8)]'
        } w-[190px] sm:w-[220px] md:w-[240px] [&_.math-markdown-content]:text-slate-950 [&_.math-markdown-content_p]:text-slate-950 [&_.math-markdown-content_p]:mb-0 [&_.katex]:text-slate-950`}
        style={{ direction: 'rtl' }}
      >
        <Handle
          type="target"
          position={isVertical ? Position.Top : Position.Left}
          className="w-3 h-3 bg-amber-200 border-2 border-slate-950 rounded-full !-top-1.5"
        />

        <div className="flex items-center justify-center gap-1 mb-1">
          <span className="text-xs">🌟</span>
          <span className="text-[10px] font-black uppercase tracking-wider bg-slate-950/15 px-2 py-0.5 rounded-full text-slate-950">
            المفهوم المركزي
          </span>
        </div>

        <div className="text-[13px] sm:text-[14px] md:text-[15px] font-black leading-tight tracking-wide text-slate-950 drop-shadow-xs">
          <MathRenderer content={data.label || 'المفهوم الرئيسي'} className="text-slate-950 font-black [&_p]:mb-0 [&_p]:text-slate-950 [&_.katex]:text-slate-950" />
        </div>

        {data.latex && (
          <div className="mt-1 font-mono text-[11px] sm:text-xs text-slate-950 font-black bg-amber-300/60 rounded-lg py-0.5 px-1.5 inline-block max-w-full overflow-hidden text-ellipsis">
            <MathRenderer content={data.latex} className="text-slate-950 font-black [&_p]:mb-0 [&_p]:text-slate-950 [&_.katex]:text-slate-950" />
          </div>
        )}

        <Handle
          type="source"
          position={isVertical ? Position.Bottom : Position.Right}
          className="w-3 h-3 bg-amber-200 border-2 border-slate-950 rounded-full !-bottom-1.5"
        />
      </div>
    );
  }

  // Branch & Leaf nodes: Rich deep navy surface with luminous golden border and crisp responsive text
  return (
    <div
      onClick={() => data.onSelect?.(data)}
      className={`relative px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl border-2 transition-all cursor-pointer select-none text-center bg-[#0c1427]/95 backdrop-blur-md text-white font-extrabold ${
        isSelected
          ? 'border-amber-300 ring-4 ring-amber-400/80 shadow-[0_0_25px_rgba(251,191,36,0.9)] scale-105 bg-[#111c38]'
          : 'border-amber-400/80 shadow-[0_0_14px_rgba(251,191,36,0.35)] hover:shadow-[0_0_22px_rgba(251,191,36,0.6)] hover:border-amber-300 hover:scale-102'
      } w-[170px] sm:w-[200px] md:w-[220px] [&_.math-markdown-content]:text-white [&_.math-markdown-content_p]:text-white [&_.math-markdown-content_p]:mb-0 [&_.katex]:text-amber-300`}
      style={{ direction: 'rtl' }}
    >
      <Handle
        type="target"
        position={isVertical ? Position.Top : Position.Left}
        className="w-2.5 h-2.5 bg-amber-400 border border-slate-950 rounded-full !-top-1.5"
      />

      <div className="flex items-center justify-center gap-1 mb-1">
        <span className="text-[11px]">{categoryCfg.badge}</span>
        <span className="text-[9.5px] font-bold text-amber-300/90 bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/20">
          {categoryCfg.label}
        </span>
      </div>

      <div className="text-[12px] sm:text-[13px] md:text-[13.5px] font-black text-white leading-snug tracking-wide drop-shadow-sm">
        <MathRenderer content={data.label || 'مفهوم'} className="text-white font-extrabold [&_p]:mb-0 [&_p]:text-white [&_.katex]:text-amber-300" />
      </div>

      {data.latex && (
        <div className="mt-1.5 pt-1 border-t border-slate-800 text-center text-amber-300 font-bold text-[11px] sm:text-xs font-mono drop-shadow-sm truncate">
          <MathRenderer content={data.latex} className="text-amber-300 font-bold [&_p]:mb-0 [&_p]:text-amber-300 [&_.katex]:text-amber-300" />
        </div>
      )}

      <Handle
        type="source"
        position={isVertical ? Position.Bottom : Position.Right}
        className="w-2.5 h-2.5 bg-amber-400 border border-slate-950 rounded-full !-bottom-1.5"
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
          fontSize: 10, 
          fontFamily: 'Tajawal, sans-serif' 
        },
        labelBgStyle: { 
          fill: '#081020', 
          fillOpacity: 0.95, 
          stroke: '#D97706', 
          strokeWidth: 1, 
          rx: 5, 
          ry: 5 
        },
        labelBgPadding: [5, 2.5],
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
  // Optimized for mobile portrait and vertical reading
  const nodeWidth = isHorizontal ? 230 : 210;
  const nodeHeight = isHorizontal ? 75 : 75;

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: isHorizontal ? 40 : 28,  // tight horizontal separation for mobile
    ranksep: isHorizontal ? 80 : 55,  // vertical level spacing
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

interface FlowInnerProps {
  treeData?: any;
  markdownSchema?: string;
  unitTitle?: string;
}

const FlowInner: React.FC<FlowInnerProps> = ({
  treeData,
  markdownSchema,
  unitTitle = 'الخريطة الذهنية للوحدة'
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  // Default strictly to Vertical 'TB' (Top to Bottom) for smartphones & vertical reading
  const [direction, setDirection] = useState<'TB' | 'LR'>('TB');
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const normalizedMapData = useMemo(() => {
    if (treeData) {
      return normalizeConceptMapData(treeData, unitTitle);
    }
    if (markdownSchema) {
      return normalizeConceptMapData(markdownSchema, unitTitle);
    }
    return normalizeConceptMapData(null, unitTitle);
  }, [treeData, markdownSchema, unitTitle]);

  const handleSelectNode = useCallback((nodeData: any) => {
    setSelectedNode(nodeData);
  }, []);

  const relayout = useCallback((dir: 'TB' | 'LR') => {
    if (!normalizedMapData) return;
    const { initialNodes, initialEdges } = parseGraphToFlow(
      normalizedMapData,
      handleSelectNode,
      selectedNode?.id || null,
      dir
    );
    if (initialNodes.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges,
        dir
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setTimeout(() => {
        fitView({ padding: 0.18, duration: 400 });
      }, 50);
    }
  }, [normalizedMapData, selectedNode?.id, handleSelectNode, fitView, setNodes, setEdges]);

  useEffect(() => {
    relayout(direction);
  }, [normalizedMapData, direction]);

  const handleResetView = () => {
    fitView({ padding: 0.18, duration: 350 });
  };

  return (
    <div 
      className="w-full h-[70vh] min-h-[480px] max-h-[750px] md:h-[650px] relative rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-500/20 shadow-2xl flex flex-col select-none"
      style={{
        background: 'radial-gradient(ellipse at center, #0d152a 0%, #050914 100%)'
      }}
    >
      {/* Top Floating Control Bar - Fully Responsive for Smartphone */}
      <div className="absolute top-2.5 inset-x-2.5 sm:inset-x-auto sm:right-3 z-10 flex items-center justify-between sm:justify-start gap-1.5 bg-[#081020]/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl sm:rounded-2xl border border-amber-500/30 shadow-xl">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const newDir = direction === 'TB' ? 'LR' : 'TB';
              setDirection(newDir);
            }}
            className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 text-amber-300 rounded-lg text-xs font-black border border-amber-500/40 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="تبديل اتجاه التفرع (رأسي للهاتف / أفقي)"
          >
            {direction === 'TB' ? (
              <>
                <Smartphone size={13} className="text-amber-400" />
                <span className="text-[11px] sm:text-xs">عرض رأسي (هاتف 📱)</span>
              </>
            ) : (
              <>
                <ArrowLeftRight size={13} className="text-amber-400" />
                <span className="text-[11px] sm:text-xs">عرض أفقي ⬅️</span>
              </>
            )}
          </button>

          <button
            onClick={handleResetView}
            className="p-1 sm:px-2 sm:py-1 bg-slate-800/80 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            title="إعادة توسيط الخريطة"
          >
            <Focus size={13} className="text-amber-400" />
            <span className="hidden sm:inline text-[11px]">توسيط</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-amber-300/80 font-bold px-1.5 py-0.5 bg-slate-900/80 rounded-md border border-slate-800">
          <Layers size={12} className="text-amber-400" />
          <span>{normalizedMapData.nodes.length} عقدة</span>
        </div>
      </div>

      {/* Main Flow Canvas with full touch pan/zoom support */}
      <div className="flex-1 relative w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.4, minZoom: 0.25 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          panOnDrag={true}
          zoomOnPinch={true}
          zoomOnScroll={true}
          preventScrolling={false}
          className="w-full h-full touch-manipulation"
        >
          <Background color="#1e293b" gap={26} size={1} />
          
          <Controls 
            position="bottom-left"
            showInteractive={false}
            className="bg-[#081020]/90 fill-amber-300 text-amber-300 border-amber-500/30 shadow-xl rounded-xl p-1 !m-2.5 [&>button]:border-slate-800 [&>button]:hover:bg-slate-800" 
          />

          <MiniMap
            nodeColor={(n: any) => n?.data?.category === 'root' ? '#F59E0B' : '#38BDF8'}
            maskColor="rgba(5, 9, 20, 0.85)"
            className="bg-[#081020]/95 border border-amber-500/30 rounded-xl overflow-hidden shadow-lg hidden md:block !m-3"
          />
        </ReactFlow>

        {/* Selected Node Details: Floating Sheet on Desktop & Slide-up Drawer on Smartphone */}
        {selectedNode && (
          <div 
            className="absolute z-30 transition-all text-right shadow-2xl animate-fade-in
              /* Mobile bottom sheet */
              inset-x-2.5 bottom-2.5 max-h-[55vh] overflow-y-auto rounded-2xl bg-[#081020]/95 backdrop-blur-lg border-2 border-amber-500/40 p-4 text-white
              /* Desktop floating card */
              sm:inset-auto sm:top-14 sm:left-3 sm:w-84 sm:max-h-[80vh] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                <Info size={14} className="text-amber-400" />
                <span>{selectedNode.category === 'root' ? '🌟 المفهوم الرئيسي' : '💡 تفاصيل المفهوم المعرفي'}</span>
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-slate-800 active:scale-90 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X size={16} />
              </button>
            </div>

            <h4 className="font-extrabold text-sm sm:text-base text-white mb-2 leading-relaxed">
              <MathRenderer content={selectedNode.label} className="text-white font-extrabold [&_p]:mb-0 [&_p]:text-white [&_.katex]:text-amber-300" />
            </h4>

            {selectedNode.latex && (
              <div className="my-2 p-2.5 bg-[#03060f] rounded-xl border border-amber-500/30 text-amber-300 text-center font-mono text-xs sm:text-sm overflow-x-auto shadow-inner">
                <MathRenderer content={selectedNode.latex} className="text-amber-300 font-bold [&_p]:mb-0 [&_p]:text-amber-300 [&_.katex]:text-amber-300" />
              </div>
            )}

            {selectedNode.description && (
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                {selectedNode.description}
              </p>
            )}

            {/* Connected Relations */}
            <div className="mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
              <span className="font-bold text-amber-400 block mb-1">الروابط الدلالية المتصلة:</span>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {normalizedMapData.edges
                  .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
                  .map((e, idx) => {
                    const isOutgoing = e.from === selectedNode.id;
                    const otherNodeId = isOutgoing ? e.to : e.from;
                    const otherNode = normalizedMapData.nodes.find(n => n.id === otherNodeId);
                    return (
                      <div key={idx} className="flex items-center gap-1.5 text-slate-300 bg-slate-900/70 px-2 py-1 rounded-lg border border-slate-800/80">
                        <span className={isOutgoing ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {isOutgoing ? '⬇️ يتفرع إلى' : '⬆️ ينبثق من'}
                        </span>
                        {e.label && <span className="text-amber-300 font-bold">({e.label})</span>}
                        <span className="font-bold text-white truncate">{otherNode?.label || otherNodeId}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom subtle hint for smartphone users */}
        <div className="absolute bottom-2.5 right-2.5 z-10 bg-[#081020]/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-amber-500/20 text-slate-300 text-[10px] sm:text-[11px] font-medium pointer-events-none flex items-center gap-1">
          <Smartphone size={11} className="text-amber-400 hidden sm:inline" />
          <span>خريطة رأسية ملائمة للهواتف • انقر للتفاصيل • باعد للتكبير</span>
        </div>
      </div>
    </div>
  );
};

interface InteractiveMindMapProps {
  treeData?: any;
  markdownSchema?: string;
  unitTitle?: string;
}

export const InteractiveMindMap: React.FC<InteractiveMindMapProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
};
