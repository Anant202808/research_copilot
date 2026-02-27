import type { Paper, PaperSummary, Citation } from '../types';

// ── Config ──
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Status tracking ──
export type AIProvider = 'backend' | 'huggingface' | 'browser-fallback';
export type AIStatus = 'idle' | 'loading' | 'ready' | 'error';

let currentProvider: AIProvider = 'browser-fallback';
let currentStatus: AIStatus = 'idle';
let statusMessage = '';

export function getAIStatus(): { provider: AIProvider; status: AIStatus; message: string } {
  return { provider: currentProvider, status: currentStatus, message: statusMessage };
}

// ── Initialize ──
export async function initAI(): Promise<AIProvider> {
  currentStatus = 'loading';
  statusMessage = 'Initializing AI...';

  try {
    const res = await fetch(`${BACKEND_URL}/health`, {  // ← use /health instead of /
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      currentProvider = 'backend';
      currentStatus = 'ready';
      statusMessage = `Backend AI connected — ${data.papers_loaded || 0} papers loaded`;
      console.log('[aiService] Backend connected at', BACKEND_URL);
      return 'backend';
    }
  } catch (e) {
    console.warn('[aiService] Backend unavailable:', e);
  }

  currentProvider = 'browser-fallback';
  currentStatus = 'ready';
  statusMessage = 'Using browser-based extractive AI (offline mode)';
  console.log('[aiService] Using browser fallback');
  return 'browser-fallback';
}

// ══════════════════════════════════════════════
//  UPLOAD PAPER
// ══════════════════════════════════════════════

interface BackendUploadResponse {
  paper_id: string;
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  summary: {
    overview: string;
    findings: string[];
    methodology: string;
    limitations: string[];
  };
  citations: {
    id: string;
    title: string;
    authors: string[];
    year: number;
    journal: string;
    volume?: string;
    issue?: string;
    pages?: string;
    doi?: string;
  }[];
  keywords: string[];
  metadata: {
    text_length: number;
    citation_count: number;
  };
}

export async function uploadPaperToBackend(file: File): Promise<BackendUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BACKEND_URL}/api/upload-paper`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let errorMessage = `Upload failed with status ${res.status}`;
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch { /* Response wasn't JSON */ }
    throw new Error(errorMessage);
  }

  const data: BackendUploadResponse = await res.json();
  console.log('[aiService] Upload successful:', data.paper_id, data.title);
  return data;
}

// ══════════════════════════════════════════════
//  CONVERT BACKEND RESPONSE → Paper type
// ══════════════════════════════════════════════

const PAPER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

export function backendResponseToPaper(dto: BackendUploadResponse): Paper {
  const color = PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)];
  return {
    id: dto.paper_id,
    title: dto.title || 'Untitled Paper',
    authors: dto.authors || ['Unknown Author'],
    year: dto.year || new Date().getFullYear(),
    abstract: dto.abstract || '',
    summary: {
      overview: dto.summary?.overview || 'Summary not available.',
      findings: dto.summary?.findings || [],
      methodology: dto.summary?.methodology || 'Methodology not extracted.',
      limitations: dto.summary?.limitations || [],
    },
    citations: (dto.citations || []).map((c): Citation => ({
      id: c.id || crypto.randomUUID(),
      title: c.title || 'Unknown',
      authors: c.authors || ['Unknown'],
      year: c.year || 0,
      journal: c.journal || 'Unknown',
      volume: c.volume,
      issue: c.issue,
      pages: c.pages,
      doi: c.doi,
    })),
    keywords: dto.keywords || [],
    color,
    tags: (dto.keywords || []).slice(0, 5).map(k => ({
      label: k,
      type: 'custom' as const,
      auto: true,
    })),
    bookmarked: false,
    pageCount: undefined,
    fileSize: undefined,
  };
}

// ══════════════════════════════════════════════
//  SUMMARIZATION
// ══════════════════════════════════════════════

export async function summarizePaper(text: string): Promise<PaperSummary> {
  if (currentProvider === 'backend') {
    try {
      const res = await fetch(`${BACKEND_URL}/api/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 48000) }),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('[aiService] Backend summarization failed, using fallback:', e);
    }
  }
  return _summarizeExtractive(text.slice(0, 4000));
}

function _summarizeExtractive(text: string): PaperSummary {
  const sentences = _splitSentences(text);
  const overview = sentences.filter(s => s.length > 40).slice(0, 4).join(' ')
    || 'Summary not available — upload to backend for full analysis.';
  return {
    overview,
    findings: _extractByPattern(text, /\b(result|finding|show|demonstrate|achieve|outperform|improve|significant|accuracy|performance)\b/i),
    methodology: _extractByPattern(text, /\b(method|approach|propose|architecture|model|train|dataset|experiment|framework|algorithm)\b/i).join(' ') || 'Methodology details not extracted.',
    limitations: _extractByPattern(text, /\b(limit|drawback|shortcoming|challenge|future work|weakness|caveat|constraint|however|although)\b/i) || ['Limitations not explicitly identified.'],
  };
}

function _extractByPattern(text: string, pattern: RegExp): string[] {
  return _splitSentences(text).filter(s => pattern.test(s) && s.length > 30 && s.length < 300).slice(0, 5);
}

// ══════════════════════════════════════════════
//  GAP ANALYSIS — new backend response types
// ══════════════════════════════════════════════

// Exactly what the backend now returns (snake_case from Flask)
interface BackendEvidenceLink {
  paper_id: string;
  paper_title: string;
  citation_path: string[];
  missing_links: string[];
  explanation: string;
}

interface BackendGapItem {
  topic: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: BackendEvidenceLink[];
}

interface BackendResearchQuestion {
  question: string;
  relevance: string;
}

interface BackendPaperGroup {
  papers: string[];
  paper_ids: string[];
  related: boolean;
  common_topics: string[];
  gaps: BackendGapItem[];
  research_questions: BackendResearchQuestion[];
  methodology_differences: string[];
}

interface BackendWeaknessAnalysis {
  missing_experiments: string[];
  unsupported_claims: string[];
  ignored_factors: string[];
  unanswered_questions: string[];
  dataset_weaknesses: string[];
  overall_weakness_summary: string;
  severity: 'high' | 'medium' | 'low';
}

interface BackendIndividualWeakness {
  title: string;
  analysis: BackendWeaknessAnalysis;
}

interface BackendGapResponse {
  groups: BackendPaperGroup[];
  unrelated_papers: string[];
  individual_weaknesses: Record<string, BackendIndividualWeakness>;
  warning: string | null;
}

// What the frontend component (GapAnalysis.tsx) expects — camelCase
export interface FrontendEvidenceLink {
  paperId: string;
  paperTitle: string;
  citationPath: string[];
  missingLinks: string[];
  explanation: string;
}

export interface FrontendGapItem {
  topic: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: FrontendEvidenceLink[];
}

export interface FrontendPaperGroup {
  papers: string[];
  paper_ids: string[];
  related: boolean;
  common_topics: string[];
  gaps: FrontendGapItem[];
  research_questions: { question: string; relevance: string }[];
  methodology_differences: string[];
}

export interface FrontendWeaknessAnalysis {
  missing_experiments: string[];
  unsupported_claims: string[];
  ignored_factors: string[];
  unanswered_questions: string[];
  dataset_weaknesses: string[];
  overall_weakness_summary: string;
  severity: 'high' | 'medium' | 'low';
}

export interface FrontendIndividualWeakness {
  title: string;
  analysis: FrontendWeaknessAnalysis;
}

// This is the type GapAnalysis.tsx uses as NewGapAnalysisResult
export interface GapAnalysisResult {
  groups: FrontendPaperGroup[];
  unrelated_papers: string[];
  individual_weaknesses: Record<string, FrontendIndividualWeakness>;
  warning: string | null;
}

// ── Converters (snake_case → camelCase where needed) ──────────────────────────

function _convertEvidenceLink(e: BackendEvidenceLink): FrontendEvidenceLink {
  return {
    paperId: e.paper_id ?? '',
    paperTitle: e.paper_title ?? '',
    citationPath: e.citation_path ?? [],
    missingLinks: e.missing_links ?? [],
    explanation: e.explanation ?? '',
  };
}

function _convertGapItem(g: BackendGapItem): FrontendGapItem {
  return {
    topic: g.topic ?? '',
    description: g.description ?? '',
    severity: g.severity ?? 'medium',
    evidence: (g.evidence ?? []).map(_convertEvidenceLink),
  };
}

function _convertGroup(g: BackendPaperGroup): FrontendPaperGroup {
  return {
    papers: g.papers ?? [],
    paper_ids: g.paper_ids ?? [],
    related: g.related ?? true,
    common_topics: g.common_topics ?? [],
    gaps: (g.gaps ?? []).map(_convertGapItem),
    research_questions: (g.research_questions ?? []).map(q => ({
      question: q.question ?? '',
      relevance: q.relevance ?? '',
    })),
    methodology_differences: g.methodology_differences ?? [],
  };
}

function _convertWeakness(w: BackendIndividualWeakness): FrontendIndividualWeakness {
  return {
    title: w.title ?? '',
    analysis: {
      missing_experiments: w.analysis?.missing_experiments ?? [],
      unsupported_claims: w.analysis?.unsupported_claims ?? [],
      ignored_factors: w.analysis?.ignored_factors ?? [],
      unanswered_questions: w.analysis?.unanswered_questions ?? [],
      dataset_weaknesses: w.analysis?.dataset_weaknesses ?? [],
      overall_weakness_summary: w.analysis?.overall_weakness_summary ?? '',
      severity: w.analysis?.severity ?? 'medium',
    },
  };
}

function _convertBackendResponse(data: BackendGapResponse): GapAnalysisResult {
  const weaknesses: Record<string, FrontendIndividualWeakness> = {};
  for (const [id, w] of Object.entries(data.individual_weaknesses ?? {})) {
    weaknesses[id] = _convertWeakness(w);
  }
  return {
    groups: (data.groups ?? []).map(g => _convertGroup(g)),
    unrelated_papers: data.unrelated_papers ?? [],
    individual_weaknesses: weaknesses,
    warning: data.warning ?? null,
  };
}

// ── Public function — returns GapAnalysisResult, always ──────────────────────

export async function analyzeGaps(papers: Paper[]): Promise<GapAnalysisResult> {
  if (papers.length === 0) {
    return { groups: [], unrelated_papers: [], individual_weaknesses: {}, warning: null };
  }

  // Try backend
  if (currentProvider === 'backend' && papers.length >= 2) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/find-gaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_ids: papers.map(p => p.id) }),
      });
      if (res.ok) {
        const raw: BackendGapResponse = await res.json();
        const result = _convertBackendResponse(raw);
        console.log('[aiService] Gap analysis from backend:', result.groups.length, 'groups');
        return result;
      }
    } catch (e) {
      console.warn('[aiService] Backend gap analysis failed, using fallback:', e);
    }
  }

  console.warn('[aiService] Using browser fallback for gap analysis');
  return _analyzeGapsFallback(papers);
}

// ── Browser fallback — returns GapAnalysisResult (same type) ─────────────────

function _analyzeGapsFallback(papers: Paper[]): GapAnalysisResult {
  const allKeywords = papers.flatMap(p => p.keywords);
  const keywordFreq: Record<string, number> = {};
  allKeywords.forEach(k => { keywordFreq[k] = (keywordFreq[k] || 0) + 1; });

  const commonTopics = Object.entries(keywordFreq)
    .filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([t]) => t);

  const uniqueTopics = Object.entries(keywordFreq)
    .filter(([, c]) => c === 1).map(([t]) => t);

  const keywordPaperMap: Record<string, Set<string>> = {};
  papers.forEach(p => {
    p.keywords.forEach(k => {
      if (!keywordPaperMap[k]) keywordPaperMap[k] = new Set();
      keywordPaperMap[k].add(p.id);
    });
  });

  const topKeywords = Object.entries(keywordFreq)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);

  const gaps: FrontendGapItem[] = [];

  for (let i = 0; i < topKeywords.length && gaps.length < 2; i++) {
    for (let j = i + 1; j < topKeywords.length && gaps.length < 2; j++) {
      const kwA = topKeywords[i];
      const kwB = topKeywords[j];
      const papersA = keywordPaperMap[kwA] || new Set<string>();
      const papersB = keywordPaperMap[kwB] || new Set<string>();
      const overlap = [...papersA].filter(id => papersB.has(id));

      if (overlap.length === 0 && papersA.size > 0 && papersB.size > 0) {
        const relatedPapers = papers.filter(p => papersA.has(p.id) || papersB.has(p.id));
        gaps.push({
          topic: `${kwA} ↔ ${kwB} Integration`,
          description: `"${kwA}" and "${kwB}" appear across papers but are never studied together.`,
          severity: 'high',
          evidence: _buildEvidence(relatedPapers, `${kwA} and ${kwB} integration`),
        });
      }
    }
  }

  if (uniqueTopics.length > 0) {
    gaps.push({
      topic: 'Isolated Research Threads',
      description: `${uniqueTopics.slice(0, 4).join(', ')} appear in only one paper each.`,
      severity: 'low',
      evidence: _buildEvidence(
        papers.filter(p => p.keywords.some(k => uniqueTopics.includes(k))).slice(0, 2),
        'broader investigation'
      ),
    });
  }

  const researchQuestions: { question: string; relevance: string }[] = [];
  if (commonTopics.length >= 2) {
    researchQuestions.push({
      question: `How do ${commonTopics[0]} and ${commonTopics[1]} interact?`,
      relevance: `Most frequent shared themes across ${papers.length} papers`,
    });
  }

  // Wrap fallback result in the new GapAnalysisResult shape
  return {
    groups: [{
      papers: papers.map(p => p.title),
      paper_ids: papers.map(p => p.id),
      related: true,
      common_topics: commonTopics,
      gaps,
      research_questions: researchQuestions,
      methodology_differences: papers.length >= 2
        ? ['Full methodology comparison requires backend AI analysis.']
        : [],
    }],
    unrelated_papers: [],
    individual_weaknesses: {},
    warning: null,
  };
}

function _buildEvidence(papers: Paper[], missingLink: string): FrontendEvidenceLink[] {
  return papers.slice(0, 3).map(p => ({
    paperId: p.id,
    paperTitle: p.title,
    citationPath: [p.title, '→', 'related work'],
    missingLinks: [missingLink],
    explanation: `"${p.title}" addresses related topics but does not explore ${missingLink}.`,
  }));
}

// ══════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════

function _splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
}