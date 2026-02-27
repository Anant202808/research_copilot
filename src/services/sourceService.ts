const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface RelatedPaper {
    semantic_id: string;
    title: string;
    authors: string[];
    year: number | null;
    abstract: string;
    citation_count: number;
    pdf_url: string;
    url: string;
    doi: string;
}

export interface FindSourcesResponse {
    paper_id: string;
    source_paper_title: string;
    related_count: number;
    related_papers: RelatedPaper[];
}

export interface SearchSourcesResponse {
    query: string;
    count: number;
    papers: RelatedPaper[];
}

// Find related papers for an uploaded paper
export async function findRelatedPapers(paperId: string): Promise<FindSourcesResponse> {
    const res = await fetch(`${BACKEND_URL}/api/find-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id: paperId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed with status ${res.status}`);
    }
    return res.json();
}

// Free-text search on Semantic Scholar
export async function searchSources(query: string, limit = 10): Promise<SearchSourcesResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const res = await fetch(`${BACKEND_URL}/api/find-sources/search?${params}`, {
        method: 'GET',
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed with status ${res.status}`);
    }
    return res.json();
}