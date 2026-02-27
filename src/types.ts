// ── Core Domain Types ──

export interface PaperSummary {
  overview: string;
  findings: string[];
  methodology: string;
  limitations: string[];
}

export interface Citation {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
}

export interface PaperTag {
  label: string;
  type: 'method' | 'dataset' | 'problem' | 'custom';
  auto: boolean;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  summary: PaperSummary;
  citations: Citation[];
  keywords: string[];
  color: string;
  tags: PaperTag[];
  bookmarked: boolean;
  pageCount?: number;
  fileSize?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  color: string;
  size: number;
  x: number;
  y: number;
  citationCount: number;
  cluster?: string;
  year?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  strength?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ConceptNode {
  id: string;
  label: string;
  color: string;
  size: number;
  x: number;
  y: number;
  paperIds: string[];
}

export interface ConceptEdge {
  from: string;
  to: string;
  label: string;
}

export interface ConceptGraphData {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export interface EvidenceLink {
  paperId: string;
  paperTitle: string;
  citationPath: string[];
  missingLinks: string[];
  explanation: string;
}

export interface ResearchGap {
  topic: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: EvidenceLink[];
  confidence?: number;
}

export interface GapAnalysisResult {
  commonTopics: string[];
  gaps: ResearchGap[];
  researchQuestions: { question: string; relevance: string }[];
  methodologyDifferences: string[];
}

export interface GapConstraints {
  methodology: string;
  dataset: string;
  yearRange: [number, number];
  domainScope: string;
}

export interface InsightCard {
  id: string;
  type: 'underexplored' | 'overcited' | 'emerging' | 'contradiction' | 'stagnation';
  title: string;
  description: string;
  relatedPaperIds: string[];
  graphHighlight?: { nodeIds: string[]; edgeKeys: string[] };
  icon: string;
  color: string;
  collapsed?: boolean;
}

export interface ExplainableInsight {
  suggestion: string;
  topInfluencingPapers: { id: string; title: string; weight: number }[];
  repeatedKeywords: { keyword: string; count: number }[];
  citationImbalance: { paperId: string; title: string; inDegree: number; outDegree: number }[];
  reasoning: string;
  confidence?: 'low' | 'medium' | 'high';
}

export interface TimelineEntry {
  year: number;
  papers: Paper[];
  clusterCount: number;
  newTopics: string[];
  deadTopics: string[];
}

export interface SessionMemory {
  explored: string[];
  ignored: string[];
  bookmarked: string[];
  lastView: ViewType;
  searchHistory: string[];
  insightsDismissed: string[];
}

export type CitationFormat = 'APA' | 'MLA' | 'IEEE' | 'BibTeX';
export type ViewType = 'dashboard' | 'graph' | 'citations' | 'gaps' | 'timeline' | 'insights' | 'sources' | 'draft' | 'notes';
export type GraphMode = 'paper' | 'concept';


// ── DTOs (Service Contracts) ──

export interface UploadPaperDTO {
  file: File;
  correlationId: string;
}

export interface UploadPaperResponseDTO {
  paperId: string;
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  summary: PaperSummary;
  citations: Citation[];
  keywords: string[];
  metadata: { textLength: number; citationCount: number; pageCount?: number; fileSize?: number };
  correlationId: string;
}

export interface GapAnalysisRequestDTO {
  paperIds: string[];
  constraints?: GapConstraints;
  correlationId: string;
}

export interface GapAnalysisResponseDTO {
  result: GapAnalysisResult;
  correlationId: string;
  aiConfidence: 'low' | 'medium' | 'high';
}

export interface CitationExtractionDTO {
  paperId: string;
  format: CitationFormat;
  correlationId: string;
}

export interface GraphResponseDTO {
  nodes: GraphNode[];
  edges: GraphEdge[];
  correlationId: string;
}
