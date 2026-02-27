import { useState, useCallback } from 'react';
import type { Paper, CitationFormat } from '../types';
import { formatCitation } from '../data/mockData';

interface CitationListProps {
  papers: Paper[];
  darkMode?: boolean;
}

const FORMATS: CitationFormat[] = ['APA', 'MLA', 'IEEE', 'BibTeX'];

export function CitationList({ papers }: CitationListProps) {
  const [selectedPaperId, setSelectedPaperId] = useState<string>(papers[0]?.id || '');
  const [format, setFormat] = useState<CitationFormat>('APA');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const selectedPaper = papers.find(p => p.id === selectedPaperId);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text.replace(/\*/g, '')).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleCopyAll = useCallback(() => {
    if (!selectedPaper) return;
    const allCitations = selectedPaper.citations
      .map(c => formatCitation(c, format).replace(/\*/g, ''))
      .join('\n\n');
    navigator.clipboard.writeText(allCitations).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  }, [selectedPaper, format]);

  const handleDownload = useCallback(() => {
    if (!selectedPaper) return;
    const allCitations = selectedPaper.citations
      .map(c => formatCitation(c, format).replace(/\*/g, ''))
      .join('\n\n');
    const ext = format === 'BibTeX' ? 'bib' : 'txt';
    const blob = new Blob([allCitations], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citations_${format.toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedPaper, format]);

  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 animate-fade-in">
        <svg className="w-16 h-16 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-lg font-medium text-slate-500">No Papers Available</p>
        <p className="text-sm mt-1">Upload papers to extract citations</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Paper Selector */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Select Paper</label>
          <select
            value={selectedPaperId}
            onChange={e => setSelectedPaperId(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
          >
            {papers.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {/* Format Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Citation Format</label>
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            {FORMATS.map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  format === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {selectedPaper && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            {copiedAll ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy All
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {format === 'BibTeX' ? '.bib' : '.txt'}
          </button>
          <span className="text-sm text-slate-400 ml-auto">
            {selectedPaper.citations.length} citation{selectedPaper.citations.length !== 1 ? 's' : ''} found
          </span>
        </div>
      )}

      {/* Citation List */}
      {selectedPaper && (
        <div className="space-y-3">
          {selectedPaper.citations.map((citation, index) => {
            const formatted = formatCitation(citation, format);
            const isCopied = copiedId === citation.id;
            return (
              <div
                key={citation.id}
                className="group relative bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all animate-slide-up"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center mt-0.5">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    {format === 'BibTeX' ? (
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono text-xs leading-relaxed">{formatted}</pre>
                    ) : (
                      <p className="text-sm text-slate-700 citation-text leading-relaxed"
                         dangerouslySetInnerHTML={{ __html: formatted.replace(/\*(.*?)\*/g, '<em>$1</em>') }}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => handleCopy(formatted, citation.id)}
                    className={`flex-shrink-0 p-2 rounded-lg transition-all ${
                      isCopied
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isCopied ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
