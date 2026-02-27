import { useMemo } from 'react';
import type { Paper } from '../types';
import { buildTimelineData, TOPIC_CLUSTERS, getClusterForPaper } from '../data/mockData';

interface TimelineProps {
  papers: Paper[];
  selectedYear: number | null;
  onSelectYear: (year: number | null) => void;
  onSelectPaper: (id: string) => void;
  darkMode?: boolean;
}

export function Timeline({ papers, selectedYear, onSelectYear, onSelectPaper }: TimelineProps) {
  const timeline = useMemo(() => buildTimelineData(papers), [papers]);
  const allYears = useMemo(() => {
    if (timeline.length === 0) return [];
    const min = timeline[0].year;
    const max = timeline[timeline.length - 1].year;
    const years: number[] = [];
    for (let y = min; y <= max; y++) years.push(y);
    return years;
  }, [timeline]);

  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 animate-fade-in">
        <span className="text-4xl mb-3">🧭</span>
        <p className="text-lg font-medium text-slate-500">No Timeline Data</p>
        <p className="text-sm mt-1">Upload papers to see research evolution</p>
      </div>
    );
  }

  const entryMap = new Map(timeline.map(e => [e.year, e]));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Year slider */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span>🧭</span> Research Evolution Timeline
          </h3>
          {selectedYear && (
            <button onClick={() => onSelectYear(null)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              Show All Years
            </button>
          )}
        </div>

        {/* Timeline bar */}
        <div className="relative">
          <div className="h-2 bg-slate-100 rounded-full" />
          <div className="absolute top-0 left-0 right-0 flex justify-between">
            {allYears.map(year => {
              const entry = entryMap.get(year);
              const hasPapers = entry && entry.papers.length > 0;
              const isSelected = selectedYear === year;
              return (
                <button
                  key={year}
                  onClick={() => onSelectYear(isSelected ? null : year)}
                  className="relative group flex flex-col items-center -mt-1"
                  style={{ flex: 1 }}
                >
                  <div className={`w-4 h-4 rounded-full border-2 transition-all z-10 ${
                    isSelected ? 'bg-indigo-600 border-indigo-600 scale-125' :
                    hasPapers ? 'bg-white border-indigo-400 hover:bg-indigo-100' :
                    'bg-slate-200 border-slate-300'
                  }`}>
                    {hasPapers && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[9px] px-1.5 rounded-full font-bold">
                        {entry.papers.length}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] mt-2 font-medium ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`}>{year}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Year detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {timeline.filter(e => !selectedYear || e.year === selectedYear).map((entry, idx) => (
          <div key={entry.year} className="bg-white border border-slate-200 rounded-xl p-5 animate-slide-up" style={{ animationDelay: `${idx * 0.08}s` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold text-slate-800">{entry.year}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                  {entry.papers.length} paper{entry.papers.length !== 1 ? 's' : ''}
                </span>
                {entry.clusterCount > 0 && (
                  <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full font-medium">
                    {entry.clusterCount} cluster{entry.clusterCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Papers in this year */}
            {entry.papers.length > 0 && (
              <div className="space-y-2 mb-3">
                {entry.papers.map(p => {
                  const cluster = getClusterForPaper(p);
                  const clusterColor = TOPIC_CLUSTERS[cluster]?.color || p.color;
                  return (
                    <button key={p.id} onClick={() => onSelectPaper(p.id)} className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors group">
                      <span className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: clusterColor }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors line-clamp-1">{p.title}</p>
                        <p className="text-[10px] text-slate-400">{p.authors[0]?.split(' ').pop()} et al.</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {entry.papers.length === 0 && (
              <div className="py-4 text-center">
                <span className="text-xs text-slate-400 italic">⏸️ Stagnation zone — no publications</span>
              </div>
            )}

            {/* New topics */}
            {entry.newTopics.length > 0 && (
              <div className="mt-2">
                <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">New Topics</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {entry.newTopics.map((t, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Dead topics */}
            {entry.deadTopics.length > 0 && (
              <div className="mt-2">
                <span className="text-[10px] font-medium text-red-500 uppercase tracking-wider">Fading Topics</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {entry.deadTopics.map((t, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full line-through">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
