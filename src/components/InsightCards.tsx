import type { InsightCard } from '../types';

interface InsightCardsProps {
  cards: InsightCard[];
  onDismiss: (id: string) => void;
  onExplain: (suggestion: string) => void;
  onNavigateGraph: (nodeIds: string[]) => void;
  darkMode?: boolean;
}

export function InsightCards({ cards, onDismiss, onExplain, onNavigateGraph }: InsightCardsProps) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 animate-fade-in">
        <span className="text-4xl mb-3">📌</span>
        <p className="text-lg font-medium text-slate-500">No Insights Yet</p>
        <p className="text-sm mt-1">Upload more papers to generate insight cards</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📌</span> AI Insight Cards
          </h2>
          <p className="text-sm text-slate-500 mt-1">Auto-generated research intelligence — click to explore</p>
        </div>
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
          {cards.length} insight{cards.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card, idx) => (
          <div
            key={card.id}
            className="relative bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-all group animate-slide-up overflow-hidden"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            {/* Color accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: card.color }} />

            <div className="flex items-start gap-3 mt-1">
              <span className="text-2xl">{card.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider" style={{ backgroundColor: card.color + '20', color: card.color }}>
                    {card.type.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">{card.title}</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{card.description}</p>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-3">
                  {card.graphHighlight && (
                    <button
                      onClick={() => onNavigateGraph(card.graphHighlight!.nodeIds)}
                      className="text-[10px] px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                      View in Graph
                    </button>
                  )}
                  <button
                    onClick={() => onExplain(card.description)}
                    className="text-[10px] px-2.5 py-1 bg-violet-50 text-violet-600 rounded-lg font-medium hover:bg-violet-100 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Why?
                  </button>
                </div>
              </div>
              <button
                onClick={() => onDismiss(card.id)}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
