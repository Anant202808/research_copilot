import { useState, useMemo } from 'react';
import type { Paper } from '../types';
import { buildGraphData, generateInsightCards, getClusterForPaper } from '../data/mockData';

interface WhatIfSimulationProps {
  papers: Paper[];
  edges: { from: string; to: string; strength?: number }[];
  whatIfPaperId: string | null;
  onSetWhatIf: (id: string | null) => void;
  onSelectPaper: (id: string) => void;
  darkMode?: boolean;
}

const hypotheticalPapers: Paper[] = [
  {
    id: 'hypo-1', title: 'Efficient Transformers: A Survey', authors: ['Yi Tay'], year: 2022,
    abstract: 'A survey of efficient transformer variants.', color: '#14b8a6',
    summary: { overview: 'Surveys efficient transformers.', findings: ['Linear attention works'], methodology: 'Survey', limitations: ['Only text'] },
    citations: [{ id: 'hc1', title: 'Attention Is All You Need', authors: ['Vaswani'], year: 2017, journal: 'NeurIPS' }],
    keywords: ['efficient transformers', 'linear attention', 'sparse attention', 'transformer'], tags: [{ label: 'transformer', type: 'method', auto: true }], bookmarked: false,
  },
  {
    id: 'hypo-2', title: 'Multimodal Learning with Transformers', authors: ['Peng Xu'], year: 2023,
    abstract: 'A survey on multimodal transformers.', color: '#ec4899',
    summary: { overview: 'Explores multimodal transformers.', findings: ['Cross-modal attention effective'], methodology: 'Survey', limitations: ['Limited modalities'] },
    citations: [
      { id: 'hc2', title: 'Attention Is All You Need', authors: ['Vaswani'], year: 2017, journal: 'NeurIPS' },
      { id: 'hc3', title: 'An Image is Worth 16x16 Words', authors: ['Dosovitskiy'], year: 2021, journal: 'ICLR' },
    ],
    keywords: ['multimodal', 'cross-modal', 'vision-language', 'transformer'], tags: [{ label: 'transformer', type: 'method', auto: true }], bookmarked: false,
  },
  {
    id: 'hypo-3', title: 'Constitutional AI: Harmlessness from Feedback', authors: ['Yuntao Bai'], year: 2022,
    abstract: 'Training AI assistants to be harmless.', color: '#f59e0b',
    summary: { overview: 'Proposes constitutional AI for alignment.', findings: ['RLHF improves safety'], methodology: 'Reinforcement learning from human feedback', limitations: ['Costly annotation'] },
    citations: [{ id: 'hc4', title: 'Language Models are Few-Shot Learners', authors: ['Brown'], year: 2020, journal: 'NeurIPS' }],
    keywords: ['AI safety', 'alignment', 'RLHF', 'constitutional AI'], tags: [{ label: 'reinforcement', type: 'method', auto: true }], bookmarked: false,
  },
];

export function WhatIfSimulation({ papers, edges, whatIfPaperId, onSetWhatIf, onSelectPaper }: WhatIfSimulationProps) {
  const [hoveredHypo, setHoveredHypo] = useState<string | null>(null);

  const activeHypo = hypotheticalPapers.find(p => p.id === whatIfPaperId);

  const simulation = useMemo(() => {
    if (!activeHypo) return null;
    const simPapers = [...papers, activeHypo];
    const simEdges = [...edges];

    // Add edges based on citation matches
    activeHypo.citations.forEach(c => {
      const matchedPaper = papers.find(p => p.title.toLowerCase().includes(c.title.toLowerCase().substring(0, 20)));
      if (matchedPaper) simEdges.push({ from: activeHypo.id, to: matchedPaper.id, strength: 2 });
    });

    // Check if any existing paper keywords overlap
    papers.forEach(p => {
      const shared = p.keywords.filter(k => activeHypo.keywords.includes(k));
      if (shared.length >= 2) simEdges.push({ from: activeHypo.id, to: p.id, strength: 1 });
    });

    const graph = buildGraphData(simPapers, simEdges);
    const insights = generateInsightCards(simPapers, simEdges);
    const newClusters = new Set(simPapers.map(p => getClusterForPaper(p)));
    const oldClusters = new Set(papers.map(p => getClusterForPaper(p)));
    const newClusterNames = [...newClusters].filter(c => !oldClusters.has(c));

    return {
      graph,
      insights,
      newEdges: simEdges.length - edges.length,
      newClusters: newClusterNames,
      totalNodes: simPapers.length,
    };
  }, [activeHypo, papers, edges]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>🧪</span> What-If Simulation
        </h2>
        <p className="text-sm text-slate-500 mt-1">See how adding a paper would change the research landscape</p>
      </div>

      {/* Hypothetical paper selection */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Choose a hypothetical paper to add:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {hypotheticalPapers.map(hp => {
            const isActive = whatIfPaperId === hp.id;
            const isHovered = hoveredHypo === hp.id;
            return (
              <button
                key={hp.id}
                onClick={() => onSetWhatIf(isActive ? null : hp.id)}
                onMouseEnter={() => setHoveredHypo(hp.id)}
                onMouseLeave={() => setHoveredHypo(null)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  isActive ? 'border-indigo-400 bg-indigo-50 shadow-md' :
                  isHovered ? 'border-slate-300 bg-slate-50' :
                  'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hp.color }} />
                  <span className="text-[10px] font-medium text-slate-400">{hp.year}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 line-clamp-2">{hp.title}</p>
                <p className="text-xs text-slate-400 mt-1">{hp.authors[0]} et al.</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {hp.keywords.slice(0, 3).map((k, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{k}</span>
                  ))}
                </div>
                {isActive && (
                  <div className="mt-2 text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Simulating...
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Simulation results */}
      {simulation && activeHypo && (
        <div className="space-y-4 animate-slide-up">
          {/* Impact summary */}
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-indigo-800 mb-3 flex items-center gap-2">
              ⚡ Impact of adding "{activeHypo.title}"
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-indigo-700">{simulation.totalNodes}</p>
                <p className="text-xs text-indigo-500">Total Papers</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">+{simulation.newEdges}</p>
                <p className="text-xs text-emerald-500">New Connections</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-violet-600">{simulation.newClusters.length > 0 ? `+${simulation.newClusters.length}` : '—'}</p>
                <p className="text-xs text-violet-500">New Clusters</p>
              </div>
            </div>
          </div>

          {/* New insights generated */}
          {simulation.insights.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">New Insights Generated:</h3>
              <div className="space-y-2">
                {simulation.insights.slice(0, 3).map(card => (
                  <div key={card.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <span className="text-lg">{card.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{card.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{card.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Graph preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Graph Preview (simulated):</h3>
            <div className="h-48 bg-slate-50 rounded-lg flex items-center justify-center relative overflow-hidden">
              <svg viewBox="0 0 700 300" className="w-full h-full">
                {simulation.graph.edges.map((e, i) => {
                  const from = simulation.graph.nodes.find(n => n.id === e.from);
                  const to = simulation.graph.nodes.find(n => n.id === e.to);
                  if (!from || !to) return null;
                  const isNew = e.from === activeHypo.id || e.to === activeHypo.id;
                  return (
                    <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={isNew ? '#6366f1' : '#e2e8f0'} strokeWidth={isNew ? 2.5 : 1}
                      strokeDasharray={isNew ? '6 3' : 'none'} opacity={isNew ? 0.8 : 0.4} />
                  );
                })}
                {simulation.graph.nodes.map(n => {
                  const isNew = n.id === activeHypo.id;
                  return (
                    <g key={n.id} onClick={() => onSelectPaper(n.id)} style={{ cursor: 'pointer' }}>
                      {isNew && <circle cx={n.x} cy={n.y} r={n.size + 5} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 2" opacity="0.5" />}
                      <circle cx={n.x} cy={n.y} r={n.size * 0.8} fill={n.color} opacity={isNew ? 1 : 0.7} />
                      <text x={n.x} y={n.y + n.size + 12} textAnchor="middle" fontSize="8" fill="#64748b">{n.label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-indigo-500 rounded" style={{ borderBottom: '2px dashed #6366f1' }} /> New connection
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-indigo-500" /> Added paper
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
