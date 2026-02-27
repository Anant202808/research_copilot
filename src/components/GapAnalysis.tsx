import { useState, useCallback } from 'react';
import type { Paper, GapConstraints } from '../types';
import type { EvidenceLink } from '../types';
import { generateGapAnalysis } from '../data/mockData';
import {
  analyzeGaps,
  getAIStatus,
  type GapAnalysisResult,
  type FrontendGapItem as GapItem,
  type FrontendPaperGroup as PaperGroup,
  type FrontendIndividualWeakness as IndividualWeakness,
} from '../services/aiService';

// ── Props ─────────────────────────────────────────────────────────────────────

interface GapAnalysisProps {
  papers: Paper[];
  constraints: GapConstraints;
  onSetConstraints: (c: Partial<GapConstraints>) => void;
  onExplain: (suggestion: string) => void;
  darkMode?: boolean;
}

// ── Severity styles ───────────────────────────────────────────────────────────

const severityColor = {
  high: 'bg-rose-50   border-rose-200   text-rose-800',
  medium: 'bg-amber-50  border-amber-200  text-amber-800',
  low: 'bg-blue-50   border-blue-200   text-blue-800',
} as const;

const severityBadge = {
  high: 'bg-rose-100   text-rose-700',
  medium: 'bg-amber-100  text-amber-700',
  low: 'bg-blue-100   text-blue-700',
} as const;

const severityIcon = { high: '🔴', medium: '🟡', low: '🔵' } as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function EvidencePanel({ evidence, onClose }: { evidence: EvidenceLink[]; onClose: () => void }) {
  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 mt-2 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Evidence ({evidence.length} source{evidence.length !== 1 ? 's' : ''})
        </h4>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-3">
        {evidence.map((ev, i) => (
          <div key={i} className="bg-indigo-50/50 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-700">{ev.paperTitle}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400">Citation path:</span>
              {ev.citationPath.map((step, j) => (
                <span key={j} className="text-[10px] text-indigo-600 font-medium">{step}</span>
              ))}
            </div>
            {ev.missingLinks.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[10px] text-red-500 font-medium">⚠ Missing:</span>
                {ev.missingLinks.map((ml, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full">{ml}</span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-1.5 italic">{ev.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeaknessCard({ weakness }: { weakness: IndividualWeakness }) {
  const [expanded, setExpanded] = useState(false);
  const a = weakness.analysis;

  const sections: [string, string, string[]][] = [
    ['🧪', 'Missing Experiments', a.missing_experiments],
    ['⚠️', 'Unsupported Claims', a.unsupported_claims],
    ['🔍', 'Ignored Factors', a.ignored_factors],
    ['❓', 'Unanswered Questions', a.unanswered_questions],
    ['📊', 'Dataset Weaknesses', a.dataset_weaknesses],
  ];

  return (
    <div className={`border rounded-xl overflow-hidden ${severityColor[a.severity]}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{severityIcon[a.severity]}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{weakness.title}</p>
            <p className="text-xs opacity-70 mt-0.5 line-clamp-1">{a.overall_weakness_summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${severityBadge[a.severity]}`}>
            {a.severity}
          </span>
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-slide-up">
          <p className="text-xs text-slate-600 bg-white/50 rounded-lg p-3 leading-relaxed">
            {a.overall_weakness_summary}
          </p>
          {sections.map(([icon, label, items]) => {
            const meaningful = items.filter(s => !s.startsWith('No specific'));
            if (meaningful.length === 0) return null;
            return (
              <div key={label} className="bg-white/50 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">{icon} {label}</p>
                <ul className="space-y-1.5">
                  {meaningful.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-50" />
                      <span className="text-xs text-slate-600 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupGapResults({
  group,
  groupIndex,
  onExplain,
}: {
  group: PaperGroup;
  groupIndex: number;
  onExplain: (s: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'gaps' | 'questions' | 'methods'>('gaps');
  const [expandedGap, setExpandedGap] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Group {groupIndex + 1}</span>
        {group.papers.map((title, i) => (
          <span key={i} className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium truncate max-w-[200px]">{title}</span>
        ))}
      </div>

      {group.common_topics.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Common Topics
          </h4>
          <div className="flex flex-wrap gap-2">
            {group.common_topics.map((topic, i) => (
              <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">{topic}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        {([
          ['gaps', 'Research Gaps', group.gaps.length],
          ['questions', 'Research Questions', group.research_questions.length],
          ['methods', 'Method Differences', group.methodology_differences.length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label} <span className="opacity-60 ml-1">({count})</span>
          </button>
        ))}
      </div>

      {activeTab === 'gaps' && (
        <div className="space-y-3">
          {group.gaps.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No gaps found between these papers.</p>
          )}
          {group.gaps.map((gap: GapItem, i: number) => (
            <div key={i} className={`border rounded-xl p-4 ${severityColor[gap.severity]} animate-slide-up`} style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">{gap.topic}</h4>
                  <p className="text-sm opacity-80 mt-1 leading-relaxed">{gap.description}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <button
                      onClick={() => setExpandedGap(expandedGap === i ? null : i)}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-white/60 hover:bg-white/80 transition-colors flex items-center gap-1"
                    >
                      🔍 {gap.evidence.length} evidence source{gap.evidence.length !== 1 ? 's' : ''} {expandedGap === i ? '▼' : '▶'}
                    </button>
                    <button
                      onClick={() => onExplain(gap.description)}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-white/60 hover:bg-white/80 transition-colors"
                    >
                      🧠 Why?
                    </button>
                  </div>
                </div>
                <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${severityBadge[gap.severity]}`}>
                  {gap.severity}
                </span>
              </div>
              {expandedGap === i && (
                <EvidencePanel
                  evidence={gap.evidence.map(e => ({
                    paperId: e.paperId,
                    paperTitle: e.paperTitle,
                    citationPath: e.citationPath,
                    missingLinks: e.missingLinks,
                    explanation: e.explanation,
                  }))}
                  onClose={() => setExpandedGap(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="space-y-3">
          {group.research_questions.map((rq, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">Q{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{rq.question}</p>
                  <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {rq.relevance}
                  </p>
                </div>
                <button onClick={() => onExplain(rq.question)} className="text-[10px] text-violet-500 hover:text-violet-700 font-medium">🧠 Why?</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'methods' && (
        <div className="space-y-3">
          {group.methodology_differences.map((diff, i) => (
            <div key={i} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-4 animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="mt-1.5 w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
              <p className="text-sm text-slate-700">{diff}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function GapAnalysis({ papers, constraints, onSetConstraints, onExplain }: GapAnalysisProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<GapAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showConstraints, setShowConstraints] = useState(false);
  const [weaknessTab, setWeaknessTab] = useState<'groups' | 'weaknesses'>('groups');

  const togglePaper = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  }, []);

  const handleAnalyze = useCallback(async () => {
    const selectedPapers = papers.filter(p => selectedIds.has(p.id));
    if (selectedPapers.length < 2) return;
    setIsAnalyzing(true);
    setResult(null);

    const aiStatus = getAIStatus();

    if (aiStatus.status === 'ready') {
      try {
        // No cast needed — analyzeGaps returns GapAnalysisResult directly
        const aiResult: GapAnalysisResult = await analyzeGaps(selectedPapers);
        if (aiResult) {
          setResult(aiResult);
          setIsAnalyzing(false);
          return;
        }
      } catch (err) {
        console.warn('AI gap analysis failed, falling back to heuristic:', err);
      }
    }

    setTimeout(() => {
      const mock = generateGapAnalysis(selectedPapers, constraints);
      setResult({
        groups: [{
          papers: selectedPapers.map(p => p.title),
          paper_ids: selectedPapers.map(p => p.id),
          related: true,
          common_topics: mock.commonTopics,
          gaps: mock.gaps,
          research_questions: mock.researchQuestions,
          methodology_differences: mock.methodologyDifferences,
        }],
        unrelated_papers: [],
        individual_weaknesses: {},
        warning: null,
      });
      setIsAnalyzing(false);
    }, 1500);
  }, [papers, selectedIds, constraints]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(papers.slice(0, 10).map(p => p.id)));
  }, [papers]);

  if (papers.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 animate-fade-in">
        <svg className="w-16 h-16 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-lg font-medium text-slate-500">Need More Papers</p>
        <p className="text-sm mt-1">Upload at least 2 papers to find research gaps</p>
      </div>
    );
  }

  const totalGaps = result?.groups.reduce((sum, g) => sum + g.gaps.length, 0) ?? 0;
  const totalWeaknesses = result
    ? (Object.keys(result.individual_weaknesses).length || papers.length)
    : papers.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Select Papers to Analyze</h3>
            <p className="text-xs text-slate-400 mt-0.5">Choose 2–10 papers for gap analysis</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConstraints(!showConstraints)}
              className={`text-xs font-medium flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${showConstraints ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🎯 Constraints {showConstraints ? '▼' : '▶'}
            </button>
            <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Select All</button>
            <span className="text-xs text-slate-300">|</span>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
          </div>
        </div>

        {showConstraints && (
          <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-slide-up">
            <h4 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              🎯 Gap Constraints <span className="text-slate-400 font-normal">— AI will respect these filters</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-slate-500 mb-1 block">Methodology Focus</label>
                <input value={constraints.methodology} onChange={e => onSetConstraints({ methodology: e.target.value })} placeholder="e.g. transformer, CNN..."
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 mb-1 block">Dataset Filter</label>
                <input value={constraints.dataset} onChange={e => onSetConstraints({ dataset: e.target.value })} placeholder="e.g. ImageNet, GLUE..."
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 mb-1 block">Year Range: {constraints.yearRange[0]}–{constraints.yearRange[1]}</label>
                <div className="flex gap-2">
                  <input type="range" min="2010" max="2024" value={constraints.yearRange[0]} onChange={e => onSetConstraints({ yearRange: [parseInt(e.target.value), constraints.yearRange[1]] })} className="flex-1" />
                  <input type="range" min="2010" max="2024" value={constraints.yearRange[1]} onChange={e => onSetConstraints({ yearRange: [constraints.yearRange[0], parseInt(e.target.value)] })} className="flex-1" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 mb-1 block">Domain Scope</label>
                <input value={constraints.domainScope} onChange={e => onSetConstraints({ domainScope: e.target.value })} placeholder="e.g. NLP, vision..."
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {papers.map(paper => (
            <button key={paper.id} onClick={() => togglePaper(paper.id)}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${selectedIds.has(paper.id) ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200' : 'border-slate-150 hover:border-slate-300 hover:bg-slate-50'}`}>
              <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${selectedIds.has(paper.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                {selectedIds.has(paper.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{paper.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-400">{paper.authors[0]} et al., {paper.year}</p>
                  {paper.tags.length > 0 && (
                    <div className="flex gap-1">
                      {paper.tags.slice(0, 2).map((t, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{t.label}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleAnalyze} disabled={selectedIds.size < 2 || isAnalyzing}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-200">
            {isAnalyzing ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Research Gaps
              </>
            )}
          </button>
          <span className="text-sm text-slate-400">
            {selectedIds.size} selected {selectedIds.size < 2 && '(min 2)'}
          </span>
        </div>
      </div>

      {result && !isAnalyzing && (
        <div className="space-y-5 animate-slide-up">
          {result.warning && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Unrelated Papers Detected</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">{result.warning}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Related Groups', value: result.groups.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Gaps Found', value: totalGaps, color: 'text-rose-600', bg: 'bg-rose-50' },
              { label: 'Papers Analyzed', value: totalWeaknesses, color: 'text-violet-600', bg: 'bg-violet-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-3 text-center border border-white`}>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setWeaknessTab('groups')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${weaknessTab === 'groups' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              🔬 Cross-Paper Gaps
              <span className="text-xs opacity-60 ml-1">({result.groups.length} group{result.groups.length !== 1 ? 's' : ''})</span>
            </button>
            <button onClick={() => setWeaknessTab('weaknesses')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${weaknessTab === 'weaknesses' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              🩺 Individual Weaknesses
              <span className="text-xs opacity-60 ml-1">({totalWeaknesses} paper{totalWeaknesses !== 1 ? 's' : ''})</span>
            </button>
          </div>

          {weaknessTab === 'groups' && (
            <div className="space-y-8">
              {result.groups.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                  <p className="text-slate-400 text-sm">No related paper groups found.</p>
                  <p className="text-slate-400 text-xs mt-1">Your papers may be too different in topic for cross-paper gap analysis.</p>
                </div>
              ) : (
                result.groups.map((group, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-5">
                    <GroupGapResults group={group} groupIndex={i} onExplain={onExplain} />
                  </div>
                ))
              )}
              {result.unrelated_papers.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2">📄 Excluded from cross-paper analysis (unrelated):</p>
                  <div className="flex flex-wrap gap-2">
                    {result.unrelated_papers.map((title, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 bg-white border border-slate-200 text-slate-500 rounded-full">{title}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">Their individual weaknesses are still available in the "Individual Weaknesses" tab.</p>
                </div>
              )}
            </div>
          )}

          {weaknessTab === 'weaknesses' && (
            <div className="space-y-3">
              {Object.keys(result.individual_weaknesses).length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                  <p className="text-slate-400 text-sm font-medium">Individual weakness analysis unavailable</p>
                  <p className="text-slate-400 text-xs mt-1">This feature requires backend AI. You are currently using fallback analysis.</p>
                </div>
              ) : (
                Object.entries(result.individual_weaknesses).map(([id, weakness]) => (
                  <WeaknessCard key={id} weakness={weakness} />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}