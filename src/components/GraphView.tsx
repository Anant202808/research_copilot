import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { GraphData, Paper, GraphMode, ConceptGraphData } from '../types';
import { TOPIC_CLUSTERS, buildConceptGraph } from '../data/mockData';

interface GraphViewProps {
  data: GraphData;
  papers: Paper[];
  onSelectPaper: (paperId: string) => void;
  selectedPaperId: string | null;
  graphMode: GraphMode;
  onSetGraphMode: (mode: GraphMode) => void;
  highlightNodeIds?: string[];
  darkMode?: boolean;
}

export function GraphView({ data, papers, onSelectPaper, selectedPaperId, graphMode, onSetGraphMode, highlightNodeIds }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState(data.nodes);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState({ x: -50, y: -50, w: 800, h: 600 });
  const [showLegend, setShowLegend] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const conceptGraph: ConceptGraphData = useMemo(() => buildConceptGraph(papers), [papers]);

  useEffect(() => { setNodes(data.nodes); }, [data]);

  const externalHighlight = highlightNodeIds && highlightNodeIds.length > 0;

  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX + viewBox.x;
    const mouseY = (e.clientY - rect.top) * scaleY + viewBox.y;
    dragOffset.current = { x: mouseX - node.x, y: mouseY - node.y };
    setDragging(nodeId);
  }, [nodes, viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    if (dragging) {
      const mouseX = (e.clientX - rect.left) * scaleX + viewBox.x;
      const mouseY = (e.clientY - rect.top) * scaleY + viewBox.y;
      setNodes(prev => prev.map(n => n.id === dragging
        ? { ...n, x: mouseX - dragOffset.current.x, y: mouseY - dragOffset.current.y }
        : n
      ));
    } else if (isPanning.current) {
      const dx = (e.clientX - panStart.current.x) * scaleX;
      const dy = (e.clientY - panStart.current.y) * scaleY;
      setViewBox(prev => ({ ...prev, x: panStart.current.vx - dx, y: panStart.current.vy - dy }));
    }
  }, [dragging, viewBox]);

  const handleMouseUp = useCallback(() => { setDragging(null); isPanning.current = false; }, []);

  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
    }
  }, [viewBox]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9;
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x;
    const mouseY = ((e.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y;
    const newW = viewBox.w * scaleFactor;
    const newH = viewBox.h * scaleFactor;
    setViewBox({
      x: mouseX - (mouseX - viewBox.x) * scaleFactor,
      y: mouseY - (mouseY - viewBox.y) * scaleFactor,
      w: Math.max(200, Math.min(2000, newW)),
      h: Math.max(150, Math.min(1500, newH)),
    });
  }, [viewBox]);

  const isConnected = useCallback((nodeId: string) => {
    if (externalHighlight) return highlightNodeIds!.includes(nodeId);
    if (!selectedPaperId && !hoveredNode) return true;
    const activeId = hoveredNode || selectedPaperId;
    if (nodeId === activeId) return true;
    return data.edges.some(e => (e.from === activeId && e.to === nodeId) || (e.to === activeId && e.from === nodeId));
  }, [selectedPaperId, hoveredNode, data.edges, externalHighlight, highlightNodeIds]);

  const isEdgeConnected = useCallback((edge: { from: string; to: string }) => {
    if (externalHighlight) return highlightNodeIds!.includes(edge.from) && highlightNodeIds!.includes(edge.to);
    if (!selectedPaperId && !hoveredNode) return true;
    const activeId = hoveredNode || selectedPaperId;
    return edge.from === activeId || edge.to === activeId;
  }, [selectedPaperId, hoveredNode, externalHighlight, highlightNodeIds]);

  if (data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 animate-fade-in">
        <svg className="w-20 h-20 mb-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <p className="text-lg font-medium text-slate-500">No Papers in Graph</p>
        <p className="text-sm mt-1">Upload papers to visualize relationships</p>
      </div>
    );
  }

  // ── Concept graph ─────────────────────────────────────────────────────────
  if (graphMode === 'concept') {
    return (
      <div className="h-full flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-1 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex p-0.5 bg-slate-100 rounded-lg">
              <button onClick={() => onSetGraphMode('paper')} className="px-3 py-1 text-xs font-medium rounded-md text-slate-500 hover:text-slate-700">Paper Graph</button>
              <button onClick={() => onSetGraphMode('concept')} className="px-3 py-1 text-xs font-medium rounded-md bg-white shadow-sm text-slate-800">Concept Graph</button>
            </div>
            <span className="text-xs text-slate-400">🧩 {conceptGraph.nodes.length} concepts · {conceptGraph.edges.length} dependencies</span>
          </div>
        </div>

        {/* Concept graph info banner */}
        <div className="mb-3 flex items-start gap-2.5 px-3 py-2.5 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700">
          <span className="flex-shrink-0 mt-0.5">🧩</span>
          <p className="leading-relaxed">
            <span className="font-semibold">Concept Graph</span> — clusters research topics extracted from your papers.
            Node size = how many papers share that concept. Edges show conceptual dependencies between topics.
            Hover a node to see which papers contribute to it.
          </p>
        </div>

        <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden graph-container shadow-sm">
          <svg className="w-full h-full" viewBox="-50 -50 800 600">
            {conceptGraph.edges.map((e, i) => {
              const from = conceptGraph.nodes.find(n => n.id === e.from);
              const to = conceptGraph.nodes.find(n => n.id === e.to);
              if (!from || !to) return null;
              return (
                <g key={i}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#c7d2fe" strokeWidth={1.5} opacity={0.6} />
                  <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 5} textAnchor="middle" fontSize="7" fill="#94a3b8">{e.label}</text>
                </g>
              );
            })}
            {conceptGraph.nodes.map(n => (
              <g key={n.id} style={{ cursor: 'pointer' }}>
                <circle cx={n.x} cy={n.y} r={n.size} fill={n.color} opacity={0.8} />
                <circle cx={n.x} cy={n.y} r={n.size} fill="none" stroke={n.color} strokeWidth={2} opacity={0.3} />
                <text x={n.x} y={n.y + n.size + 14} textAnchor="middle" fontSize="10" fontWeight="500" fill="#334155">{n.label}</text>
                <text x={n.x} y={n.y + 3} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="white" fontWeight="bold">{n.paperIds.length}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  }

  // ── Paper graph ───────────────────────────────────────────────────────────
  const activeClusters = Object.entries(TOPIC_CLUSTERS).filter(([key]) => nodes.some(n => n.cluster === key));

  return (
    <div className="h-full flex flex-col animate-fade-in">

      {/* Top bar */}
      <div className="flex items-center justify-between px-1 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex p-0.5 bg-slate-100 rounded-lg">
            <button onClick={() => onSetGraphMode('paper')} className="px-3 py-1 text-xs font-medium rounded-md bg-white shadow-sm text-slate-800">Paper Graph</button>
            <button onClick={() => onSetGraphMode('concept')} className="px-3 py-1 text-xs font-medium rounded-md text-slate-500 hover:text-slate-700">Concept Graph</button>
          </div>
          <span className="text-xs text-slate-400">{data.nodes.length} papers · {data.edges.length} citation links</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegend(v => !v)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${showLegend ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to read this
          </button>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span>Scroll to zoom</span><span>·</span><span>Drag to pan</span><span>·</span><span>Click to explore</span>
          </div>
        </div>
      </div>

      {/* Explanation banner — shown when legend button is on */}
      {showLegend && (
        <div className="mb-3 bg-indigo-50 border border-indigo-100 rounded-xl p-4 animate-slide-up">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2.5 flex-1">
              <p className="text-xs font-bold text-indigo-800">Reading the Citation Graph</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <span className="text-white text-[9px] font-bold">3</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Node size</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Larger = more times cited by other papers in your set. The badge number is the citation count.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-3 h-3 rounded-full bg-indigo-400 flex-shrink-0" />
                    <div className="w-8 h-0.5 bg-indigo-300" />
                    <div className="w-0 h-0 border-l-4 border-l-indigo-400 border-t-2 border-b-2 border-t-transparent border-b-transparent" />
                    <div className="w-3 h-3 rounded-full bg-violet-400 flex-shrink-0" />
                  </div>
                  <div className="ml-1">
                    <p className="text-xs font-semibold text-slate-700">Arrows</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Arrow from A → B means Paper A cites Paper B. Detected by title matching and author-year patterns.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex gap-1 mt-0.5 flex-shrink-0">
                    {['#6366f1', '#8b5cf6', '#ec4899'].map(c => (
                      <div key={c} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Colors</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Each color represents a topic cluster. Papers with the same color share research themes.</p>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-indigo-600 bg-indigo-100/60 rounded-lg px-3 py-1.5">
                💡 Click any node to highlight its direct connections and dim everything else. Click the background to reset.
              </p>
            </div>
            <button onClick={() => setShowLegend(false)} className="text-indigo-400 hover:text-indigo-600 flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* No edges info */}
      {data.edges.length === 0 && data.nodes.length > 0 && (
        <div className="mb-3 flex items-center gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
          <span>⚠️</span>
          <p>No citation links detected between these papers. The graph shows each paper as an isolated node. Upload papers that cite each other to see connections.</p>
        </div>
      )}

      <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden graph-container shadow-sm">
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onMouseDown={handleBgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
            </marker>
            <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
            </marker>
            {nodes.map(node => (
              <radialGradient key={`grad-${node.id}`} id={`grad-${node.id}`}>
                <stop offset="0%" stopColor={node.color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={node.color} stopOpacity="1" />
              </radialGradient>
            ))}
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.1" />
            </filter>
          </defs>

          <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="transparent" />

          {/* Cluster backgrounds */}
          {(() => {
            const clusters: Record<string, typeof nodes> = {};
            nodes.forEach(n => { const c = n.cluster || 'default'; (clusters[c] ??= []).push(n); });
            return Object.entries(clusters).filter(([, ns]) => ns.length >= 2).map(([cluster, ns]) => {
              const cx = ns.reduce((s, n) => s + n.x, 0) / ns.length;
              const cy = ns.reduce((s, n) => s + n.y, 0) / ns.length;
              const maxDist = Math.max(...ns.map(n => Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2)));
              const color = TOPIC_CLUSTERS[cluster]?.color || '#6366f1';
              return (
                <circle key={`cluster-${cluster}`} cx={cx} cy={cy} r={maxDist + 50}
                  fill={color} opacity={0.04} stroke={color} strokeWidth={1}
                  strokeDasharray="8 4" strokeOpacity={0.15} />
              );
            });
          })()}

          {/* Edges */}
          {data.edges.map((edge, i) => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            const active = isEdgeConnected(edge);
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const offsetX = (dx / dist) * toNode.size;
            const offsetY = (dy / dist) * toNode.size;
            const strength = edge.strength || 1;
            return (
              <line key={`edge-${i}`}
                x1={fromNode.x} y1={fromNode.y}
                x2={toNode.x - offsetX} y2={toNode.y - offsetY}
                stroke={active ? '#6366f1' : '#e2e8f0'}
                strokeWidth={active ? 1 + strength : Math.max(0.5, strength * 0.5)}
                opacity={active ? 0.8 : 0.3}
                markerEnd={active ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                style={{ transition: 'all 0.3s ease' }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const connected = isConnected(node.id);
            const isSelected = selectedPaperId === node.id;
            const isHovered = hoveredNode === node.id;
            const paper = papers.find(p => p.id === node.id);

            // Tooltip: clamp to right edge of viewbox so it doesn't overflow
            const tooltipX = node.x + node.size + 8;
            const tooltipW = 220;

            return (
              <g key={node.id}
                onMouseDown={(e) => handleMouseDown(e, node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => { e.stopPropagation(); onSelectPaper(node.id); }}
                style={{ cursor: 'pointer', transition: 'opacity 0.3s ease' }}
                opacity={connected ? 1 : 0.15}
              >
                {isSelected && (
                  <circle cx={node.x} cy={node.y} r={node.size + 6}
                    fill="none" stroke={node.color} strokeWidth="2" opacity="0.4"
                    className="animate-pulse-glow" />
                )}
                <circle
                  cx={node.x} cy={node.y}
                  r={isHovered ? node.size + 3 : node.size}
                  fill={`url(#grad-${node.id})`}
                  filter="url(#shadow)"
                  stroke={isSelected ? '#fff' : 'transparent'}
                  strokeWidth={isSelected ? 3 : 0}
                  style={{ transition: 'r 0.2s ease' }}
                />
                {node.citationCount > 0 && (
                  <>
                    <circle cx={node.x + node.size * 0.7} cy={node.y - node.size * 0.7} r="10" fill="#1e293b" />
                    <text
                      x={node.x + node.size * 0.7} y={node.y - node.size * 0.7 + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="white" fontSize="9" fontWeight="bold"
                    >{node.citationCount}</text>
                  </>
                )}
                <text
                  x={node.x} y={node.y + node.size + 16}
                  textAnchor="middle" fontSize="11" fontWeight="500"
                  fill={connected ? '#334155' : '#94a3b8'}
                >{node.label}</text>

                {/* Hover tooltip — fixed size, won't overflow */}
                {isHovered && paper && (
                  <foreignObject x={tooltipX} y={node.y - 60} width={tooltipW} height={130}>
                    <div className="bg-slate-900 text-white text-[10px] p-3 rounded-xl shadow-2xl leading-relaxed pointer-events-none">
                      <p className="font-semibold text-[11px] mb-1.5 leading-snug">{paper.title}</p>
                      <p className="text-slate-300">{paper.authors.slice(0, 2).join(', ')}{paper.authors.length > 2 ? ' et al.' : ''}</p>
                      <p className="text-slate-400 mt-0.5">{paper.year}</p>
                      {paper.keywords.length > 0 && (
                        <p className="text-slate-400 mt-1.5 leading-relaxed">{paper.keywords.slice(0, 4).join(' · ')}</p>
                      )}
                      {node.citationCount > 0 && (
                        <p className="text-indigo-300 mt-1.5 font-medium">Cited {node.citationCount}× by other papers</p>
                      )}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">

        {/* Cluster color chips */}
        {activeClusters.map(([key, cluster]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cluster.color }} />
            {cluster.name}
          </span>
        ))}

        {/* Always-visible key */}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-slate-300" />
            <span className="inline-block w-4 h-3 rounded-full bg-slate-400" />
            size = citations
          </span>
          <span>→ arrow = cites</span>
          <span>color = topic cluster</span>
        </div>
      </div>
    </div>
  );
}