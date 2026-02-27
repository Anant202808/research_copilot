import type { Paper, PaperTag } from '../types';
import { SmartTags } from './SmartTags';

interface SummaryPanelProps {
  paper: Paper;
  onClose: () => void;
  onToggleBookmark: (id: string) => void;
  onUpdateTags: (id: string, tags: PaperTag[]) => void;
  darkMode?: boolean;
}

export function SummaryPanel({
  paper,
  onClose,
  onToggleBookmark,
  onUpdateTags,
}: SummaryPanelProps) {


  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white shadow-2xl animate-slide-in overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100">
          <div className="flex items-start justify-between p-6">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: paper.color }}
                />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  AI Summary
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {paper.title}
              </h2>
              <p className="text-sm text-slate-500 mt-1.5">
                {paper.authors.slice(0, 3).join(', ')}
                {paper.authors.length > 3 ? ' et al.' : ''} • {paper.year}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onToggleBookmark(paper.id)}
                className={`p-2 rounded-lg transition-colors ${paper.bookmarked
                  ? 'bg-amber-50 text-amber-500'
                  : 'hover:bg-slate-100 text-slate-300'
                  }`}
              >
                <svg
                  className="w-5 h-5"
                  fill={paper.bookmarked ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Smart Tags */}
          <SmartTags paper={paper} onUpdateTags={onUpdateTags} />

          {/* Keywords */}
          <div className="flex flex-wrap gap-1.5">
            {paper.keywords.map((kw, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium"
              >
                {kw}
              </span>
            ))}
          </div>

          {/* Overview */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Overview
            </h3>
            <p className="text-sm text-slate-600">
              {paper.summary.overview}
            </p>
          </div>

          {/* Findings */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Key Findings
            </h3>
            <ul className="space-y-2">
              {paper.summary.findings.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-600"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Methodology */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Methodology
            </h3>
            <p className="text-sm text-slate-600">
              {paper.summary.methodology}
            </p>
          </div>

          {/* Limitations */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Limitations
            </h3>
            <ul className="space-y-2">
              {paper.summary.limitations.map((l, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-600"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}