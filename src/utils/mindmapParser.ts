/**
 * Advanced Concept Map Engine - Data Normalizer & Parser
 * Handles nodes, semantic edges, mathematical LaTeX, and category classifications.
 */

export type NodeCategory = 'root' | 'concept' | 'theorem' | 'procedure' | 'warning' | 'example';

export interface ConceptNode {
  id: string;
  label: string;
  category: NodeCategory;
  description?: string;
  latex?: string | null;
  children?: ConceptNode[];
}

export interface ConceptEdge {
  from: string;
  to: string;
  label?: string;
}

export interface AdvancedConceptMapData {
  title: string;
  unit?: string;
  subject?: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  mermaidDiagram?: string;
  summary?: string;
  markdownSchema?: string;
}

export const CATEGORY_CONFIG: Record<NodeCategory, {
  label: string;
  badge: string;
  color: string;
  bgGradient: string;
  border: string;
  badgeBg: string;
  badgeText: string;
}> = {
  root: {
    label: 'المفهوم الرئيسي',
    badge: '🌟',
    color: '#F59E0B',
    bgGradient: 'from-amber-500 via-amber-500 to-amber-600',
    border: 'border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.65)] ring-2 ring-amber-300/60',
    badgeBg: 'bg-amber-950/80 text-amber-200 border-amber-400/40',
    badgeText: 'text-slate-950 font-black',
  },
  concept: {
    label: 'مفهوم أساسي',
    badge: '📖',
    color: '#FBBF24',
    bgGradient: 'from-[#0F192E] via-[#0C1527] to-[#0A1120]',
    border: 'border-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
    badgeBg: 'bg-[#0B1426] text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-300 font-bold',
  },
  theorem: {
    label: 'مبرهنة / قاعدة',
    badge: '📐',
    color: '#FBBF24',
    bgGradient: 'from-[#0F192E] via-[#0C1527] to-[#0A1120]',
    border: 'border-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
    badgeBg: 'bg-[#0B1426] text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-300 font-bold',
  },
  procedure: {
    label: 'خطوة / طريقة حل',
    badge: '⚡',
    color: '#FBBF24',
    bgGradient: 'from-[#0F192E] via-[#0C1527] to-[#0A1120]',
    border: 'border-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
    badgeBg: 'bg-[#0B1426] text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-300 font-bold',
  },
  warning: {
    label: 'ملاحظة امتحانية',
    badge: '⚠️',
    color: '#FBBF24',
    bgGradient: 'from-[#0F192E] via-[#0C1527] to-[#0A1120]',
    border: 'border-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
    badgeBg: 'bg-[#0B1426] text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-300 font-bold',
  },
  example: {
    label: 'تطبيق / حالة خاصة',
    badge: '💡',
    color: '#FBBF24',
    bgGradient: 'from-[#0F192E] via-[#0C1527] to-[#0A1120]',
    border: 'border-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
    badgeBg: 'bg-[#0B1426] text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-300 font-bold',
  },
};

export function normalizeCategory(cat?: string): NodeCategory {
  if (!cat) return 'concept';
  const lower = String(cat).toLowerCase().trim();
  if (lower === 'root' || lower.includes('مركز') || lower.includes('رئيس')) return 'root';
  if (lower === 'theorem' || lower.includes('مبرهن') || lower.includes('قاعد') || lower.includes('خاص')) return 'theorem';
  if (lower === 'procedure' || lower === 'algorithm' || lower.includes('خوارزم') || lower.includes('طريق') || lower.includes('خطو')) return 'procedure';
  if (lower === 'warning' || lower.includes('مطب') || lower.includes('فخ') || lower.includes('تنبيه') || lower.includes('حذر')) return 'warning';
  if (lower === 'example' || lower.includes('مثال') || lower.includes('تطبيق') || lower.includes('حالة')) return 'example';
  return 'concept';
}

/**
 * Normalizes any incoming data structure (Graph with nodes/edges, Tree, or Raw JSON) into AdvancedConceptMapData
 */
export function normalizeConceptMapData(raw: any, defaultTitle = 'الخريطة المفاهيمية للوحدة'): AdvancedConceptMapData {
  if (!raw) {
    return {
      title: defaultTitle,
      nodes: [{ id: 'root', label: defaultTitle, category: 'root' }],
      edges: []
    };
  }

  // If already structured with nodes array
  if (raw.nodes && Array.isArray(raw.nodes) && raw.nodes.length > 0) {
    const nodes: ConceptNode[] = raw.nodes.map((n: any, idx: number) => ({
      id: String(n.id || `node_${idx + 1}`),
      label: String(n.label || n.title || n.name || 'مفهوم'),
      category: normalizeCategory(n.category || n.type || (idx === 0 ? 'root' : 'concept')),
      description: n.description || '',
      latex: n.latex || null
    }));

    const validNodeIds = new Set(nodes.map(n => n.id));
    const edges: ConceptEdge[] = (Array.isArray(raw.edges) ? raw.edges : [])
      .filter((e: any) => e && (e.from || e.source) && (e.to || e.target))
      .map((e: any) => ({
        from: String(e.from || e.source),
        to: String(e.to || e.target),
        label: e.label || e.relation || e.text || ''
      }))
      .filter((e: ConceptEdge) => validNodeIds.has(e.from) && validNodeIds.has(e.to));

    // If no edges but multiple nodes, create default connections from root
    if (edges.length === 0 && nodes.length > 1) {
      const rootNode = nodes.find(n => n.category === 'root') || nodes[0];
      nodes.forEach(n => {
        if (n.id !== rootNode.id) {
          edges.push({
            from: rootNode.id,
            to: n.id,
            label: 'يتضمن'
          });
        }
      });
    }

    return {
      title: raw.title || defaultTitle,
      unit: raw.unit,
      subject: raw.subject,
      nodes,
      edges,
      mermaidDiagram: raw.mermaidDiagram || '',
      summary: raw.summary || '',
      markdownSchema: raw.markdownSchema || ''
    };
  }

  // If raw has hierarchical tree structure
  const treeRoot = raw.tree || raw.root || (raw.label || raw.children ? raw : null);
  if (treeRoot) {
    const nodes: ConceptNode[] = [];
    const edges: ConceptEdge[] = [];
    let idCounter = 1;

    function traverseTree(node: any, parentId: string | null = null, level = 0) {
      if (!node) return;
      const nodeId = String(node.id || `node_${idCounter++}`);
      const category = normalizeCategory(node.category || node.type || (level === 0 ? 'root' : 'concept'));

      nodes.push({
        id: nodeId,
        label: String(node.label || node.title || node.name || 'مفهوم'),
        category,
        description: node.description || '',
        latex: node.latex || null
      });

      if (parentId) {
        edges.push({
          from: parentId,
          to: nodeId,
          label: node.relation || (category === 'theorem' ? 'مبرهنة' : category === 'procedure' ? 'خوارزمية' : category === 'warning' ? 'يحذر من' : 'يتفرع إلى')
        });
      }

      const children = node.children || node.nodes || [];
      if (Array.isArray(children)) {
        children.forEach((child: any) => traverseTree(child, nodeId, level + 1));
      }
    }

    traverseTree(treeRoot);

    return {
      title: raw.title || treeRoot.label || defaultTitle,
      unit: raw.unit,
      subject: raw.subject,
      nodes,
      edges,
      mermaidDiagram: raw.mermaidDiagram || '',
      summary: raw.summary || '',
      markdownSchema: raw.markdownSchema || ''
    };
  }

  // If raw is a markdown text
  if (typeof raw === 'string' || raw.markdownSchema) {
    return parseMarkdownToConceptMap(typeof raw === 'string' ? raw : raw.markdownSchema, raw.title || defaultTitle);
  }

  return {
    title: defaultTitle,
    nodes: [{ id: 'root', label: defaultTitle, category: 'root' }],
    edges: []
  };
}

/**
 * Fallback parser for markdown schema
 */
export function parseMarkdownToConceptMap(markdown: string, defaultTitle = 'الخريطة المفاهيمية للوحدة'): AdvancedConceptMapData {
  const nodes: ConceptNode[] = [];
  const edges: ConceptEdge[] = [];

  const rootNode: ConceptNode = {
    id: 'node_root',
    label: defaultTitle,
    category: 'root',
    description: 'المفهوم الرئيسي والجامع لأفكار الدرس'
  };
  nodes.push(rootNode);

  if (!markdown || typeof markdown !== 'string') {
    return {
      title: defaultTitle,
      nodes,
      edges
    };
  }

  const lines = markdown.split('\n').map(l => l.trimEnd()).filter(l => l.trim().length > 0);
  let currentParentId = rootNode.id;
  let idCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      const headerText = trimmed.replace(/^#+\s*/, '').trim();
      if (headerText) {
        const subId = `node_${idCounter++}`;
        nodes.push({
          id: subId,
          label: headerText,
          category: normalizeCategory(headerText)
        });
        edges.push({
          from: rootNode.id,
          to: subId,
          label: 'محور فرعي'
        });
        currentParentId = subId;
      }
    } else if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*]|\d+\.\s*/, '').trim();
      const indent = line.search(/\S/);
      const itemId = `node_${idCounter++}`;
      const cat = normalizeCategory(itemText);

      nodes.push({
        id: itemId,
        label: itemText,
        category: cat
      });

      edges.push({
        from: indent > 2 && currentParentId !== rootNode.id ? currentParentId : rootNode.id,
        to: itemId,
        label: cat === 'warning' ? 'فخ امتحاني' : cat === 'theorem' ? 'مبرهنة' : 'يتضمن'
      });
    }
  }

  return {
    title: defaultTitle,
    nodes,
    edges,
    markdownSchema: markdown
  };
}

// Backward compatibility helper
export function normalizeTreeData(raw: any, defaultTitle = 'الخريطة الذهنية للوحدة') {
  const mapData = normalizeConceptMapData(raw, defaultTitle);
  // Reconstruct tree representation if needed
  const root = mapData.nodes.find(n => n.category === 'root') || mapData.nodes[0];
  if (!root) return { id: 'root', label: defaultTitle, type: 'root', children: [] };

  function buildSubtree(nodeId: string, visited = new Set<string>()): any {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);

    const node = mapData.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    const childEdges = mapData.edges.filter(e => e.from === nodeId);
    const children = childEdges
      .map(e => buildSubtree(e.to, new Set(visited)))
      .filter(Boolean);

    return {
      id: node.id,
      label: node.label,
      type: node.category,
      description: node.description,
      latex: node.latex,
      children
    };
  }

  return buildSubtree(root.id) || { id: 'root', label: defaultTitle, type: 'root', children: [] };
}
export function parseMarkdownToTree(markdown: string, defaultTitle = 'الخريطة الذهنية للوحدة') {
  return normalizeTreeData(parseMarkdownToConceptMap(markdown, defaultTitle), defaultTitle);
}
