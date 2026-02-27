import type { ExplainableInsight } from '../types';

interface ExplainPanelProps {
  insight: ExplainableInsight | null;
  onClose: () => void;
  darkMode?: boolean;
}

export function ExplainPanel({ insight, onClose }: ExplainPanelProps) {
  if (!insight) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl animate-slide-in overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100">
          <div className="flex items-start justify-between p-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🧠</span>
                <span className="text-xs font-semibold text-violet-600 uppercase tracking-wider">Explainable AI</span>
              </div>
              <h2 className="text-base font-bold text-slate-900">Why did AI suggest this?</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Suggestion */}
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
            <p className="text-sm text-violet-800 italic">"{insight.suggestion}"</p>
          </div>

          {/* Reasoning */}
          <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Reasoning
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">{insight.reasoning}</p>
          </div>

          {/* Top influencing papers */}
          <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Top Influencing Papers
            </h3>
            <div className="space-y-2">
              {insight.topInfluencingPapers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 truncate">{p.title}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-indigo-600 font-semibold">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    {p.weight}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Repeated keywords */}
          <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Repeated Keywords
            </h3>
            <div className="flex flex-wrap gap-2">
              {insight.repeatedKeywords.map((kw, i) => (
                <span key={i} className="text-xs px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-medium flex items-center gap-1.5">
                  {kw.keyword}
                  <span className="bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full text-[9px] font-bold">{kw.count}×</span>
                </span>
              ))}
            </div>
          </div>

          {/* Citation imbalance */}
          {insight.citationImbalance.length > 0 && (
            <div className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
                Citation Imbalance
              </h3>
              <div className="space-y-2">
                {insight.citationImbalance.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-800 font-medium truncate flex-1 mr-3">{item.title}</p>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        {item.inDegree} in
                      </span>
                      <span className="flex items-center gap-1 text-blue-600">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        {item.outDegree} out
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
