import { useState, useCallback } from 'react';
import type { Paper } from '../types';
import {
    findRelatedPapers,
    searchSources,
    type RelatedPaper,
} from '../services/sourceService';

interface SourceFinderProps {
    papers: Paper[];
    darkMode: boolean;
}

export function SourceFinder({ papers, darkMode: dm }: SourceFinderProps) {
    const [query, setQuery] = useState('');
    const [selectedPaperId, setSelectedPaperId] = useState<string>('');
    const [results, setResults] = useState<RelatedPaper[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchedFor, setSearchedFor] = useState('');
    const [mode, setMode] = useState<'search' | 'related'>('search');

    // ── Pre-computed class strings (no nested ternaries in JSX) ──
    const cardClass = dm
        ? 'bg-slate-800 border-slate-700 border rounded-xl'
        : 'bg-white border-slate-200 border rounded-xl';

    const textClass = dm ? 'text-slate-200' : 'text-slate-800';
    const subClass = dm ? 'text-slate-400' : 'text-slate-500';

    const inputClass = dm
        ? 'w-full px-3 py-2 rounded-lg border text-sm bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'
        : 'w-full px-3 py-2 rounded-lg border text-sm bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500';

    const modeActiveClass = 'flex-1 py-2 rounded-lg text-sm font-medium transition-all bg-indigo-600 text-white';
    const modeInactiveClass = dm
        ? 'flex-1 py-2 rounded-lg text-sm font-medium transition-all bg-slate-700 text-slate-400 hover:text-slate-200'
        : 'flex-1 py-2 rounded-lg text-sm font-medium transition-all bg-slate-100 text-slate-500 hover:text-slate-700';

    const badgeWrapClass = dm
        ? 'flex-shrink-0 text-center px-3 py-2 rounded-lg bg-slate-700'
        : 'flex-shrink-0 text-center px-3 py-2 rounded-lg bg-slate-50';

    const badgeNumClass = dm
        ? 'text-lg font-bold text-white'
        : 'text-lg font-bold text-slate-800';

    const badgeSubClass = dm ? 'text-[10px] text-slate-400' : 'text-[10px] text-slate-500';

    const doiClass = dm
        ? 'text-xs px-3 py-1 rounded-lg bg-slate-700 text-slate-400'
        : 'text-xs px-3 py-1 rounded-lg bg-slate-100 text-slate-500';

    const skeletonLineClass = dm ? 'bg-slate-700' : 'bg-slate-200';

    // ── Handlers ──
    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const res = await searchSources(query.trim());
            setResults(res.papers);
            setSearchedFor(query.trim());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    }, [query]);

    const handleFindRelated = useCallback(async () => {
        if (!selectedPaperId) return;
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const res = await findRelatedPapers(selectedPaperId);
            setResults(res.related_papers);
            setSearchedFor('papers related to "' + res.source_paper_title + '"');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to find related papers');
        } finally {
            setLoading(false);
        }
    }, [selectedPaperId]);

    return (
        <div className="space-y-6">

            {/* Mode Toggle + Input */}
            <div className={cardClass + ' p-4'}>
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setMode('search')}
                        className={mode === 'search' ? modeActiveClass : modeInactiveClass}
                    >
                        🔍 Search Semantic Scholar
                    </button>
                    <button
                        onClick={() => setMode('related')}
                        className={mode === 'related' ? modeActiveClass : modeInactiveClass}
                    >
                        📄 Find Related to My Paper
                    </button>
                </div>

                {mode === 'search' ? (
                    <div className="flex gap-2">
                        <input
                            className={inputClass}
                            placeholder="e.g. transformer attention mechanism NLP..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                        />
                        <button
                            onClick={handleSearch}
                            disabled={loading || !query.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <select
                            className={inputClass}
                            value={selectedPaperId}
                            onChange={e => setSelectedPaperId(e.target.value)}
                        >
                            <option value="">Select an uploaded paper...</option>
                            {papers.map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleFindRelated}
                            disabled={loading || !selectedPaperId}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        >
                            {loading ? 'Finding...' : 'Find'}
                        </button>
                    </div>
                )}

                {papers.length === 0 && mode === 'related' && (
                    <p className={'text-xs mt-2 ' + subClass}>
                        Upload a paper first to use this mode.
                    </p>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                    ⚠️ {error}
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className={'text-sm font-semibold ' + textClass}>
                            {results.length} results for <span className="text-indigo-500">"{searchedFor}"</span>
                        </h3>
                        <span className={'text-xs ' + subClass}>via Semantic Scholar</span>
                    </div>

                    <div className="space-y-3">
                        {results.map(paper => (
                            <div key={paper.semantic_id} className={cardClass + ' p-4 hover:shadow-md transition-shadow'}>
                                <div className="flex items-start justify-between gap-3">

                                    {/* Left: paper info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className={'text-sm font-semibold leading-snug ' + textClass}>
                                            {paper.title}
                                        </h4>

                                        <p className={'text-xs mt-1 ' + subClass}>
                                            {paper.authors.slice(0, 3).join(', ')}
                                            {paper.authors.length > 3 ? ' et al.' : ''}
                                            {paper.year ? ' • ' + paper.year : ''}
                                            {paper.citation_count > 0 ? ' • ' + paper.citation_count + ' citations' : ''}
                                        </p>

                                        {paper.abstract && (
                                            <p className={'text-xs mt-2 leading-relaxed line-clamp-3 ' + subClass}>
                                                {paper.abstract}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {paper.pdf_url && (
                                                <a
                                                    href={paper.pdf_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                                                >
                                                    📥 Download PDF
                                                </a>
                                            )}
                                            {paper.url && (
                                                <a
                                                    href={paper.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs px-3 py-1 border border-indigo-500 text-indigo-500 hover:bg-indigo-50 rounded-lg font-medium transition-colors"
                                                >
                                                    🔗 View on S2
                                                </a>
                                            )}
                                            {paper.doi && (
                                                <span className={doiClass}>
                                                    DOI: {paper.doi}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: citation badge */}
                                    {paper.citation_count > 0 && (
                                        <div className={badgeWrapClass}>
                                            <p className={badgeNumClass}>{paper.citation_count}</p>
                                            <p className={badgeSubClass}>citations</p>
                                        </div>
                                    )}

                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!loading && results.length === 0 && !error && (
                <div className={cardClass + ' p-12 text-center'}>
                    <p className="text-3xl mb-3">🔭</p>
                    <p className={'text-sm font-medium ' + textClass}>Find Research Sources</p>
                    <p className={'text-xs mt-1 ' + subClass}>
                        Search Semantic Scholar or find papers related to your uploads
                    </p>
                </div>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className={cardClass + ' p-4 animate-pulse'}>
                            <div className={'h-4 rounded w-3/4 mb-2 ' + skeletonLineClass} />
                            <div className={'h-3 rounded w-1/2 mb-3 ' + skeletonLineClass} />
                            <div className={'h-3 rounded w-full mb-1 ' + skeletonLineClass} />
                            <div className={'h-3 rounded w-4/5 ' + skeletonLineClass} />
                        </div>
                    ))}
                </div>
            )}

        </div>
    );
}