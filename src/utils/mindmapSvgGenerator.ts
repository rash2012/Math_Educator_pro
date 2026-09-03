/**
 * Sleek Minimalist Mind Map SVG Generator
 * Generates standalone, vector SVG diagrams with golden glowing nodes, dashed relations, and deep navy background.
 */

import { AdvancedConceptMapData, normalizeConceptMapData, CATEGORY_CONFIG, NodeCategory } from './mindmapParser';

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSvgFromConceptMap(data: any, title?: string): string {
  const mapData: AdvancedConceptMapData = normalizeConceptMapData(data, title);
  const nodes = mapData.nodes;
  const edges = mapData.edges;

  if (!nodes || nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="100%" height="100%">
      <rect width="100%" height="100%" fill="#080D1A" rx="16"/>
      <text x="400" y="200" text-anchor="middle" fill="#FBBF24" font-size="16" font-family="Tajawal, Arial, sans-serif">لا توجد بيانات خريطة ذهنية متاحة</text>
    </svg>`;
  }

  const nodeWidth = 220;
  const nodeHeight = 65;
  const colGap = 60;
  const rowGap = 55;

  // Assign levels (BFS from root)
  const rootNode = nodes.find(n => n.category === 'root') || nodes[0];
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: { id: string; level: number }[] = [{ id: rootNode.id, level: 0 }];
  levels.set(rootNode.id, 0);
  visited.add(rootNode.id);

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    const outgoing = edges.filter(e => e.from === id);
    for (const edge of outgoing) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        levels.set(edge.to, level + 1);
        queue.push({ id: edge.to, level: level + 1 });
      }
    }
  }

  // Any unvisited nodes go to level 1
  nodes.forEach(n => {
    if (!levels.has(n.id)) {
      levels.set(n.id, 1);
    }
  });

  // Group nodes by level
  const nodesByLevel = new Map<number, typeof nodes>();
  nodes.forEach(n => {
    const lvl = levels.get(n.id) || 0;
    if (!nodesByLevel.has(lvl)) nodesByLevel.set(lvl, []);
    nodesByLevel.get(lvl)!.push(n);
  });

  const maxLevel = Math.max(...Array.from(nodesByLevel.keys()), 0);
  const maxRows = Math.max(...Array.from(nodesByLevel.values()).map(list => list.length), 1);

  const startY = 80;
  const positions = new Map<string, { x: number; y: number }>();

  // Vertical hierarchy: Level 0 (Center/Top), Level 1 (Branches), Level 2 (Leaves)
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const levelNodes = nodesByLevel.get(lvl) || [];
    const count = levelNodes.length;
    const totalLevelWidth = count * nodeWidth + (count - 1) * colGap;
    const startX = Math.max(50, (maxRows * (nodeWidth + colGap) - totalLevelWidth) / 2 + 50);

    levelNodes.forEach((node, idx) => {
      const x = startX + idx * (nodeWidth + colGap);
      const y = startY + lvl * (nodeHeight + rowGap + 35);
      positions.set(node.id, { x, y });
    });
  }

  // Calculate total canvas bounds
  let maxX = 800;
  let maxY = 500;
  positions.forEach(pos => {
    maxX = Math.max(maxX, pos.x + nodeWidth + 60);
    maxY = Math.max(maxY, pos.y + nodeHeight + 60);
  });

  // Generate Edge lines & labels
  const edgesSvg: string[] = [];
  edges.forEach((edge, idx) => {
    const srcPos = positions.get(edge.from);
    const tgtPos = positions.get(edge.to);
    if (!srcPos || !tgtPos) return;

    const startX = srcPos.x + nodeWidth / 2;
    const startY = srcPos.y + nodeHeight;
    const endX = tgtPos.x + nodeWidth / 2;
    const endY = tgtPos.y;
    const midY = (startY + endY) / 2;

    const pathD = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
    const cleanLabel = escapeXml(edge.label || '');

    edgesSvg.push(`
      <g class="mindmap-edge" id="edge_${idx}">
        <path d="${pathD}" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-dasharray="4 4" stroke-opacity="0.85" marker-end="url(#arrowhead)"/>
        ${cleanLabel ? `
          <rect x="${(startX + endX) / 2 - 40}" y="${midY - 10}" width="80" height="20" rx="6" fill="#081020" stroke="#D97706" stroke-width="1"/>
          <text x="${(startX + endX) / 2}" y="${midY + 4}" fill="#FDE68A" font-size="10" font-weight="bold" font-family="Tajawal, sans-serif" text-anchor="middle">${cleanLabel}</text>
        ` : ''}
      </g>
    `);
  });

  // Generate Node boxes
  const nodesSvg: string[] = [];
  nodes.forEach(node => {
    const pos = positions.get(node.id);
    if (!pos) return;

    const isRoot = node.category === 'root';
    const cleanLabel = escapeXml(node.label);
    const cleanLatex = escapeXml(node.latex || '');

    if (isRoot) {
      nodesSvg.push(`
        <g class="mindmap-node-root" id="node_${node.id}" transform="translate(${pos.x}, ${pos.y})">
          <rect width="${nodeWidth}" height="${nodeHeight}" rx="18" fill="url(#goldGrad)" stroke="#FDE68A" stroke-width="2" filter="url(#goldGlow)"/>
          <text x="${nodeWidth / 2}" y="${cleanLatex ? 32 : 38}" fill="#0F172A" font-size="14" font-weight="900" font-family="Tajawal, Arial, sans-serif" text-anchor="middle">${cleanLabel}</text>
          ${cleanLatex ? `
            <text x="${nodeWidth / 2}" y="50" fill="#0F172A" font-size="11" font-weight="bold" font-family="monospace, Arial" text-anchor="middle">${cleanLatex}</text>
          ` : ''}
        </g>
      `);
    } else {
      nodesSvg.push(`
        <g class="mindmap-node" id="node_${node.id}" transform="translate(${pos.x}, ${pos.y})">
          <rect width="${nodeWidth}" height="${nodeHeight}" rx="16" fill="#091122" stroke="#FBBF24" stroke-width="1.8" filter="url(#softGlow)"/>
          <text x="${nodeWidth / 2}" y="${cleanLatex ? 30 : 37}" fill="#F8FAFC" font-size="12.5" font-weight="bold" font-family="Tajawal, Arial, sans-serif" text-anchor="middle">${cleanLabel}</text>
          ${cleanLatex ? `
            <text x="${nodeWidth / 2}" y="49" fill="#FDE68A" font-size="11" font-weight="bold" font-family="monospace, Arial" text-anchor="middle">${cleanLatex}</text>
          ` : ''}
        </g>
      `);
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX} ${maxY}" width="100%" height="100%" style="background-color: #060B17; font-family: Tajawal, 'Segoe UI', Tahoma, sans-serif;" dir="rtl">
    <defs>
      <!-- Golden Gradients -->
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#F59E0B" />
        <stop offset="50%" stop-color="#FBBF24" />
        <stop offset="100%" stop-color="#F59E0B" />
      </linearGradient>

      <!-- Glow Filters -->
      <filter id="goldGlow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#F59E0B" flood-opacity="0.8"/>
      </filter>

      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#FBBF24" flood-opacity="0.45"/>
      </filter>

      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#F59E0B" />
      </marker>
    </defs>
    
    <!-- Deep Navy Radial Background -->
    <rect width="100%" height="100%" fill="#060B17"/>
    <circle cx="${maxX / 2}" cy="${maxY / 2}" r="${Math.max(maxX, maxY) / 1.5}" fill="#0E172E" fill-opacity="0.45" filter="blur(60px)"/>

    <!-- Edges -->
    <g class="edges-layer">
      ${edgesSvg.join('\n')}
    </g>

    <!-- Nodes -->
    <g class="nodes-layer">
      ${nodesSvg.join('\n')}
    </g>
  </svg>`;
}

// Backward compatibility
export function generateSvgFromTree(tree: any, title?: string): string {
  return generateSvgFromConceptMap(tree, title);
}
