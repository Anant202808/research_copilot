import { lazy, Suspense, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { ViewType } from './types';
import { usePaperStore } from './stores/paperStore';
import { useAIStore } from './stores/aiStore';
import { useUIStore } from './stores/uiStore';
import { useNotesStore } from './stores/notesStore';
import { buildGraphData, generateInsightCards } from './data/mockData';
import { initAI, getAIStatus } from './services/aiService';
import { UploadZone } from './components/UploadZone';
import { SkeletonGraph, SkeletonTimeline, SkeletonGap, SkeletonInsight, SkeletonCard } from './components/SkeletonLoaders';
import { KeyboardHelp } from './components/KeyboardHelp';

// ── Lazy-loaded heavy components ──
const GraphView = lazy(() => import('./components/GraphView').then(m => ({ default: m.GraphView })));
const Timeline = lazy(() => import('./components/Timeline').then(m => ({ default: m.Timeline })));
const WhatIfSimulation = lazy(() => import('./components/WhatIfSimulation').then(m => ({ default: m.WhatIfSimulation })));
const CitationList = lazy(() => import('./components/CitationList').then(m => ({ default: m.CitationList })));
const GapAnalysis = lazy(() => import('./components/GapAnalysis').then(m => ({ default: m.GapAnalysis })));
const InsightCards = lazy(() => import('./components/InsightCards').then(m => ({ default: m.InsightCards })));
const SummaryPanel = lazy(() => import('./components/SummaryPanel').then(m => ({ default: m.SummaryPanel })));
const ExplainPanel = lazy(() => import('./components/ExplainPanel').then(m => ({ default: m.ExplainPanel })));
const SourceFinder = lazy(() => import('./components/SourceFinder').then(m => ({ default: m.SourceFinder })));
const DraftWriter = lazy(() => import('./components/DraftWriter').then(m => ({ default: m.DraftWriter })));
const NotesPanel = lazy(() => import('./components/NotesPanel'));

function AIBadge() {
  const ai = useAIStore();
  const [expanded, setExpanded] = useState(false);
  const statusColor: Record<string, string> = {
    idle: 'bg-slate-400',
    loading: 'bg-amber-400 animate-pulse',
    ready: 'bg-emerald-400',
    error: 'bg-red-400',
  };
  return (
    <div className="relative">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-xs">
        <span className={`w-2 h-2 rounded-full ${statusColor[ai.status] || 'bg-slate-400'}`} />
        <span className="font-medium text-slate-600">{ai.provider === 'huggingface' ? '🤗 HF' : '🧠 Local'}</span>
      </button>
      {expanded && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 animate-fade-in">
          <h3 className="text-sm font-bold text-slate-800 mb-2">AI Engine</h3>
          <p className="text-xs text-slate-500">{ai.statusMessage || 'Extractive AI (no API key needed)'}</p>
          <button onClick={() => setExpanded(false)} className="mt-2 text-xs text-indigo-600">Close</button>
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS: { key: ViewType; label: string; icon: ReactNode; emoji: string }[] = [
  { key: 'dashboard', label: 'Dashboard', emoji: '📊', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
  { key: 'graph', label: 'Knowledge Graph', emoji: '🔗', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg> },
  { key: 'citations', label: 'Citations', emoji: '📄', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
  { key: 'gaps', label: 'Gap Finder', emoji: '🔍', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
  { key: 'timeline', label: 'Timeline', emoji: '🧭', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { key: 'insights', label: 'Insights', emoji: '📌', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
  { key: 'sources', label: 'Sources', emoji: '🔭', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
  { key: 'draft', label: 'Draft Writer', emoji: '✍️', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> },
  { key: 'notes', label: 'Notes', emoji: '📝', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> },
];

export function App() {
  const papers = usePaperStore(s => s.papers);
  const edges = usePaperStore(s => s.edges);
  const activeView = usePaperStore(s => s.activeView);
  const selectedPaperId = usePaperStore(s => s.selectedPaperId);
  const showSummary = usePaperStore(s => s.showSummary);
  const sidebarOpen = usePaperStore(s => s.sidebarOpen);
  const graphMode = usePaperStore(s => s.graphMode);
  const timelineYear = usePaperStore(s => s.timelineYear);
  const whatIfPaperId = usePaperStore(s => s.whatIfPaperId);
  const gapConstraints = usePaperStore(s => s.gapConstraints);
  const memory = usePaperStore(s => s.memory);

  const setActiveView = usePaperStore(s => s.setActiveView);
  const selectPaper = usePaperStore(s => s.selectPaper);
  const setShowSummary = usePaperStore(s => s.setShowSummary);
  const setSidebarOpen = usePaperStore(s => s.setSidebarOpen);
  const setGraphMode = usePaperStore(s => s.setGraphMode);
  const setTimelineYear = usePaperStore(s => s.setTimelineYear);
  const setGapConstraints = usePaperStore(s => s.setGapConstraints);
  const setWhatIfPaper = usePaperStore(s => s.setWhatIfPaper);
  const deletePaper = usePaperStore(s => s.deletePaper);
  const toggleBookmark = usePaperStore(s => s.toggleBookmark);
  const updatePaperTags = usePaperStore(s => s.updatePaperTags);
  const dismissInsight = usePaperStore(s => s.dismissInsight);
  const uploadPaper = usePaperStore(s => s.uploadPaper);

  const ai = useAIStore();
  const ui = useUIStore();
  const { notes, fetchNotes } = useNotesStore();

  const [graphHighlightNodes, setGraphHighlightNodes] = useState<string[]>([]);

  // Stable derived values
  const graphData = useMemo(() => buildGraphData(papers, edges), [papers, edges]);
  const selectedPaper = useMemo(() => papers.find(p => p.id === selectedPaperId) || null, [papers, selectedPaperId]);
  const totalCitations = useMemo(() => papers.reduce((s, p) => s + p.citations.length, 0), [papers]);
  const bookmarkedCount = useMemo(() => papers.filter(p => p.bookmarked).length, [papers]);
  const exploredCount = memory.explored.length;
  const insightCards = useMemo(() => {
    const dismissed = new Set(memory.insightsDismissed);
    return generateInsightCards(papers, edges).filter(c => !dismissed.has(c.id));
  }, [papers, edges, memory.insightsDismissed]);

  // Initialize AI safely
  useEffect(() => {
    initAI().then(() => {
      const status = getAIStatus();
      ai.setAIStatus(status.provider, status.status, status.message);
    }).catch(() => {
      ai.setAIStatus('browser-fallback', 'ready', 'Using browser-based AI');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load notes on mount
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', ui.darkMode);
  }, [ui.darkMode]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const views: ViewType[] = ['dashboard', 'graph', 'citations', 'gaps', 'timeline', 'insights', 'sources', 'draft', 'notes'];
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) { e.preventDefault(); setActiveView(views[num - 1]); return; }
      switch (e.key.toLowerCase()) {
        case 'd': e.preventDefault(); ui.toggleDarkMode(); break;
        case 's': e.preventDefault(); setSidebarOpen(!sidebarOpen); break;
        case 'escape': setShowSummary(false); ai.setShowExplainPanel(false); ui.setShowKeyboardHelp(false); break;
        case '?': e.preventDefault(); ui.setShowKeyboardHelp(!ui.showKeyboardHelp); break;
        case 'b': if (selectedPaperId) { e.preventDefault(); toggleBookmark(selectedPaperId); } break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveView, setSidebarOpen, sidebarOpen, setShowSummary, selectedPaperId, toggleBookmark, ai, ui]);

  const handleUpload = useCallback(async (file: File) => {
    ai.setProcessing(true);
    ai.setUploadProgress(0);
    ai.setError(null);

    const stages = [10, 25, 40, 55, 70, 85, 95];
    let idx = 0;
    const iv = setInterval(() => {
      if (idx < stages.length) {
        ai.setUploadProgress(stages[idx]);
        idx++;
      }
    }, 600);

    try {
      await uploadPaper(file);
      ai.setUploadProgress(100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process paper';
      console.error('[App] Upload failed:', message);
      ai.setError(message);
    } finally {
      clearInterval(iv);
      setTimeout(() => ai.setProcessing(false), 500);
    }
  }, [ai, uploadPaper]);

  const handleNavigateGraph = useCallback((nodeIds: string[]) => {
    setGraphHighlightNodes(nodeIds);
    setActiveView('graph');
    setTimeout(() => setGraphHighlightNodes([]), 5000);
  }, [setActiveView]);

  const handleExplain = useCallback((suggestion: string) => {
    ai.requestExplanation(suggestion, papers, edges);
  }, [ai, papers, edges]);

  const dm = ui.darkMode;

  return (
    <div className={`h-full flex flex-col ${dm ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <header className={`${dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-b flex-shrink-0 z-30`}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-1.5 rounded-lg ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'} lg:hidden`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className={`text-base font-bold leading-none ${dm ? 'text-white' : 'text-slate-900'}`}>ResearchGraph <span className="text-indigo-500">AI</span></h1>
                <p className={`text-[10px] leading-none mt-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Intelligent Research Analysis</p>
              </div>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV_ITEMS.map(item => (
              <button key={item.key} onClick={() => setActiveView(item.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${activeView === item.key
                  ? (dm ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-50 text-indigo-700')
                  : (dm ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50')
                  }`}>
                {item.icon}{item.label}
                {item.key === 'insights' && insightCards.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">{insightCards.length}</span>
                )}
                {item.key === 'notes' && notes.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">{notes.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2 text-xs">
            <AIBadge />
            <button onClick={() => ui.toggleDarkMode()} className={`p-1.5 rounded-lg transition-colors ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`} title="Toggle dark mode (D)">
              {dm ? '☀️' : '🌙'}
            </button>
            <button onClick={() => ui.setShowKeyboardHelp(true)} className={`p-1.5 rounded-lg transition-colors ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`} title="Keyboard shortcuts (?)">
              ⌨️
            </button>
            <span className={`px-2 py-1 rounded-full font-medium ${dm ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>{papers.length} papers</span>
            <span className={`px-2 py-1 rounded-full font-medium ${dm ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-700'}`}>{totalCitations} citations</span>
            {bookmarkedCount > 0 && <span className={`px-2 py-1 rounded-full font-medium ${dm ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>⭐ {bookmarkedCount}</span>}
            {exploredCount > 0 && <span className={`px-2 py-1 rounded-full font-medium ${dm ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>🧠 {exploredCount}</span>}
            {notes.length > 0 && <span className={`px-2 py-1 rounded-full font-medium ${dm ? 'bg-indigo-900/30 text-indigo-400' : 'bg-indigo-50 text-indigo-700'}`}>📝 {notes.length}</span>}
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex lg:hidden items-center gap-0.5 px-4 pb-2 overflow-x-auto">
          {NAV_ITEMS.map(item => (
            <button key={item.key} onClick={() => setActiveView(item.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${activeView === item.key ? (dm ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-50 text-indigo-700') : (dm ? 'text-slate-500' : 'text-slate-500')
                }`}>
              <span>{item.emoji}</span>{item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 ${dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-r flex flex-col transition-all duration-300 overflow-hidden z-20`}>
          <div className={`p-4 border-b ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Research Library</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {papers.map(p => (
              <div key={p.id} className={`group relative rounded-lg transition-all ${selectedPaperId === p.id ? (dm ? 'bg-indigo-900/30 ring-1 ring-indigo-700' : 'bg-indigo-50 ring-1 ring-indigo-200') : (dm ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50')}`}>
                <button onClick={() => selectPaper(p.id)} className="w-full text-left p-2.5 pr-8">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        {p.bookmarked && <span className="text-[10px]">⭐</span>}
                        {memory.explored.includes(p.id) && <span className="text-[10px]">👁️</span>}
                        <p className={`text-xs font-medium leading-snug line-clamp-2 ${dm ? 'text-slate-200' : 'text-slate-800'}`}>{p.title}</p>
                      </div>
                      <p className={`text-[10px] mt-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{p.authors[0]?.split(' ').pop()}, {p.year}</p>
                    </div>
                  </div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); deletePaper(p.id); }}
                  className={`absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-all ${dm ? 'hover:bg-red-900/30 text-slate-600 hover:text-red-400' : 'hover:bg-red-50 text-slate-300 hover:text-red-500'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            {papers.length === 0 && <div className="text-center py-8"><p className={`text-xs ${dm ? 'text-slate-600' : 'text-slate-300'}`}>No papers yet</p></div>}
          </div>
          <UploadZone onUpload={handleUpload} isProcessing={ai.isProcessing} uploadProgress={ai.uploadProgress} compact />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl mx-auto">

            {activeView === 'dashboard' && (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Papers', value: papers.length, sub: 'uploaded & analyzed', icon: '📄' },
                    { label: 'Citations', value: totalCitations, sub: 'references extracted', icon: '🔗' },
                    { label: 'Connections', value: graphData.edges.length, sub: 'citation links', icon: '🕸️' },
                    { label: 'Insights', value: insightCards.length, sub: 'AI-generated', icon: '💡' },
                    { label: 'Notes', value: notes.length, sub: 'personal annotations', icon: '📝' },
                  ].map((stat, i) => (
                    <div key={i} className={`${dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-xl border p-4 shadow-sm`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${dm ? 'text-slate-400' : 'text-slate-400'}`}>{stat.label}</span>
                        <span className="text-lg">{stat.icon}</span>
                      </div>
                      <p className={`text-2xl font-bold mt-2 ${dm ? 'text-white' : 'text-slate-900'}`}>{stat.value}</p>
                      <p className={`text-xs mt-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{stat.sub}</p>
                    </div>
                  ))}
                </div>

                <UploadZone onUpload={handleUpload} isProcessing={ai.isProcessing} uploadProgress={ai.uploadProgress} />

                {insightCards.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className={`text-lg font-bold flex items-center gap-2 ${dm ? 'text-white' : 'text-slate-800'}`}>📌 Quick Insights</h2>
                      <button onClick={() => setActiveView('insights')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View All →</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {insightCards.slice(0, 2).map(card => (
                        <div key={card.id} className={`${dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-4 flex items-start gap-3`}>
                          <span className="text-xl">{card.icon}</span>
                          <div>
                            <p className={`text-xs font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>{card.title}</p>
                            <p className={`text-[10px] mt-1 line-clamp-2 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{card.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Notes preview on dashboard */}
                {notes.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className={`text-lg font-bold flex items-center gap-2 ${dm ? 'text-white' : 'text-slate-800'}`}>📝 Recent Notes</h2>
                      <button onClick={() => setActiveView('notes')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View All →</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {notes.slice(0, 3).map(note => (
                        <div key={note.id} className={`${dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-4`}>
                          <p className={`text-xs leading-relaxed line-clamp-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{note.content}</p>
                          {note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {note.tags.slice(0, 2).map(tag => (
                                <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${dm ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>#{tag}</span>
                              ))}
                            </div>
                          )}
                          <p className={`text-[10px] mt-2 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>{new Date(note.updated_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {papers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Research Library</h2>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setActiveView('notes')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dm ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                          📝 Add Note →
                        </button>
                        <button onClick={() => setActiveView('draft')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dm ? 'bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
                          ✍️ Draft a Section →
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {papers.map((p, index) => (
                        <button key={p.id} onClick={() => selectPaper(p.id)}
                          className={`text-left ${dm ? 'bg-slate-800 border-slate-700 hover:border-indigo-600' : 'bg-white border-slate-200 hover:border-indigo-200'} border rounded-xl p-5 hover:shadow-md transition-all group animate-slide-up`}
                          style={{ animationDelay: `${index * 0.05}s` }}>
                          <div className="flex items-start gap-3">
                            <span className="mt-1 w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm" style={{ backgroundColor: p.color }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {p.bookmarked && <span className="text-xs">⭐</span>}
                                <h3 className={`text-sm font-semibold leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2 ${dm ? 'text-white' : 'text-slate-800'}`}>{p.title}</h3>
                              </div>
                              <p className={`text-xs mt-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{p.authors[0]?.split(' ').pop()} et al. • {p.year}</p>
                              <p className={`text-xs mt-2 leading-relaxed line-clamp-2 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{p.abstract}</p>
                              <div className="flex flex-wrap gap-1 mt-3">
                                {p.tags.slice(0, 3).map((t, i) => (
                                  <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${t.type === 'method' ? (dm ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600') : (dm ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                                    {t.auto ? '🤖 ' : ''}{t.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className={`flex items-center gap-3 mt-3 pt-3 border-t text-[10px] ${dm ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                            <span>{p.citations.length} citations</span>
                            <span>{p.authors.length} authors</span>
                            <span className="ml-auto text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">View →</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeView === 'graph' && (
              <div className="h-[calc(100vh-8rem)]">
                <Suspense fallback={<SkeletonGraph />}>
                  <GraphView data={graphData} papers={papers} onSelectPaper={selectPaper} selectedPaperId={selectedPaperId}
                    graphMode={graphMode} onSetGraphMode={setGraphMode} highlightNodeIds={graphHighlightNodes.length > 0 ? graphHighlightNodes : undefined} darkMode={dm} />
                </Suspense>
              </div>
            )}

            {activeView === 'citations' && (
              <div>
                <div className="mb-6">
                  <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Citation Extraction</h2>
                  <p className={`text-sm mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Extract and format citations in APA, MLA, IEEE, or BibTeX</p>
                </div>
                <Suspense fallback={<SkeletonCard />}>
                  <CitationList papers={papers} darkMode={dm} />
                </Suspense>
              </div>
            )}

            {activeView === 'gaps' && (
              <div>
                <div className="mb-6">
                  <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Research Gap Finder</h2>
                  <p className={`text-sm mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Evidence-backed gap analysis with constraint-aware filtering</p>
                </div>
                <Suspense fallback={<SkeletonGap />}>
                  <GapAnalysis papers={papers} constraints={gapConstraints} onSetConstraints={setGapConstraints} onExplain={handleExplain} darkMode={dm} />
                </Suspense>
              </div>
            )}

            {activeView === 'timeline' && (
              <div>
                <div className="mb-6">
                  <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Research Evolution Timeline</h2>
                  <p className={`text-sm mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Track how the field evolved year by year</p>
                </div>
                <Suspense fallback={<SkeletonTimeline />}>
                  <Timeline papers={papers} selectedYear={timelineYear} onSelectYear={setTimelineYear} onSelectPaper={selectPaper} darkMode={dm} />
                </Suspense>
              </div>
            )}

            {activeView === 'insights' && (
              <div className="space-y-8">
                <Suspense fallback={<SkeletonInsight />}>
                  <InsightCards cards={insightCards} onDismiss={dismissInsight} onExplain={handleExplain} onNavigateGraph={handleNavigateGraph} darkMode={dm} />
                </Suspense>
                <div className={`border-t pt-8 ${dm ? 'border-slate-700' : 'border-slate-200'}`}>
                  <Suspense fallback={<SkeletonCard />}>
                    <WhatIfSimulation papers={papers} edges={edges} whatIfPaperId={whatIfPaperId} onSetWhatIf={setWhatIfPaper} onSelectPaper={selectPaper} darkMode={dm} />
                  </Suspense>
                </div>
              </div>
            )}

            {activeView === 'sources' && (
              <div>
                <div className="mb-6">
                  <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Source Finder</h2>
                  <p className={`text-sm mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Discover related papers from Semantic Scholar — free, no API key needed</p>
                </div>
                <Suspense fallback={<SkeletonCard />}>
                  <SourceFinder papers={papers} darkMode={dm} />
                </Suspense>
              </div>
            )}

            {activeView === 'draft' && (
              <div>
                <div className="mb-6">
                  <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Draft Writer</h2>
                  <p className={`text-sm mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>AI-powered section drafting from your uploaded papers</p>
                </div>
                <Suspense fallback={<SkeletonCard />}>
                  <DraftWriter papers={papers} />
                </Suspense>
              </div>
            )}

            {activeView === 'notes' && (
              <div>
                <div className="mb-6">
                  <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Notes</h2>
                  <p className={`text-sm mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Personal annotations linked to your papers and citations</p>
                </div>
                <Suspense fallback={<SkeletonCard />}>
                  <NotesPanel mode="page" paperId={selectedPaperId ?? undefined} />
                </Suspense>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Panels */}
      {showSummary && selectedPaper && (
        <Suspense fallback={null}>
          <SummaryPanel paper={selectedPaper} onClose={() => setShowSummary(false)} onToggleBookmark={toggleBookmark} onUpdateTags={updatePaperTags} darkMode={dm} />
        </Suspense>
      )}

      {ai.showExplainPanel && (
        <Suspense fallback={null}>
          <ExplainPanel insight={ai.explainableInsight} onClose={() => ai.setShowExplainPanel(false)} darkMode={dm} />
        </Suspense>
      )}

      {ui.showKeyboardHelp && <KeyboardHelp onClose={() => ui.setShowKeyboardHelp(false)} />}

      {/* Error toast */}
      {ai.lastError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-xl animate-slide-up flex items-center gap-3">
          <span className="text-sm">{ai.lastError}</span>
          <button onClick={() => ai.setError(null)} className="text-red-200 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}