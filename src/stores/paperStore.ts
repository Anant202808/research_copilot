/**
 * Paper Store — manages PDFs, metadata, tags, bookmarks, edges.
 */

import { create } from 'zustand';
import type { Paper, PaperTag, SessionMemory, ViewType, GraphMode, GapConstraints } from '../types';
import { samplePapers, sampleGraphEdges, generateInsightCards } from '../data/mockData';
import { uploadPaperToBackend, backendResponseToPaper } from '../services/aiService';

interface PaperState {
  // Core data
  papers: Paper[];
  edges: { from: string; to: string; strength?: number }[];

  // Navigation & selection
  activeView: ViewType;
  selectedPaperId: string | null;
  showSummary: boolean;
  sidebarOpen: boolean;
  graphMode: GraphMode;
  timelineYear: number | null;
  whatIfPaperId: string | null;

  // Gap constraints
  gapConstraints: GapConstraints;

  // Session memory (Research Memory Mode)
  memory: SessionMemory;

  // Actions
  setActiveView: (view: ViewType) => void;
  selectPaper: (id: string | null) => void;
  setShowSummary: (show: boolean) => void;
  setSidebarOpen: (val: boolean) => void;
  setGraphMode: (mode: GraphMode) => void;
  setTimelineYear: (year: number | null) => void;
  setGapConstraints: (c: Partial<GapConstraints>) => void;
  setWhatIfPaper: (id: string | null) => void;
  addPaper: (paper: Paper) => void;
  deletePaper: (id: string) => void;
  toggleBookmark: (id: string) => void;
  updatePaperTags: (id: string, tags: PaperTag[]) => void;
  dismissInsight: (id: string) => void;
  uploadPaper: (file: File) => Promise<Paper>;
}

export const usePaperStore = create<PaperState>((set, get) => ({
  papers: samplePapers,
  edges: sampleGraphEdges,
  activeView: 'dashboard',
  selectedPaperId: null,
  showSummary: false,
  sidebarOpen: true,
  graphMode: 'paper',
  timelineYear: null,
  whatIfPaperId: null,
  gapConstraints: {
    methodology: '',
    dataset: '',
    yearRange: [2014, 2024],
    domainScope: '',
  },
  memory: {
    explored: [],
    ignored: [],
    bookmarked: [],
    lastView: 'dashboard',
    searchHistory: [],
    insightsDismissed: [],
  },

  setActiveView: (view) => set(s => ({
    activeView: view,
    memory: { ...s.memory, lastView: view },
  })),

  selectPaper: (id) => set(s => ({
    selectedPaperId: id,
    showSummary: id !== null,
    memory: id
      ? { ...s.memory, explored: [...new Set([...s.memory.explored, id])] }
      : s.memory,
  })),

  setShowSummary: (show) => set({ showSummary: show }),
  setSidebarOpen: (val) => set({ sidebarOpen: val }),
  setGraphMode: (mode) => set({ graphMode: mode }),
  setTimelineYear: (year) => set({ timelineYear: year }),
  setWhatIfPaper: (id) => set({ whatIfPaperId: id }),

  setGapConstraints: (c) => set(s => ({
    gapConstraints: { ...s.gapConstraints, ...c },
  })),

  addPaper: (paper) => set(s => ({ papers: [...s.papers, paper] })),

  deletePaper: (id) => set(s => ({
    papers: s.papers.filter(p => p.id !== id),
    selectedPaperId: s.selectedPaperId === id ? null : s.selectedPaperId,
    showSummary: s.selectedPaperId === id ? false : s.showSummary,
  })),

  toggleBookmark: (id) => set(s => ({
    papers: s.papers.map(p => p.id === id ? { ...p, bookmarked: !p.bookmarked } : p),
    memory: {
      ...s.memory,
      bookmarked: s.papers.find(p => p.id === id)?.bookmarked
        ? s.memory.bookmarked.filter(b => b !== id)
        : [...s.memory.bookmarked, id],
    },
  })),

  updatePaperTags: (id, tags) => set(s => ({
    papers: s.papers.map(p => p.id === id ? { ...p, tags } : p),
  })),

  dismissInsight: (id) => set(s => ({
    memory: { ...s.memory, insightsDismissed: [...s.memory.insightsDismissed, id] },
  })),

  // ✅ REAL upload — sends file to backend
  uploadPaper: async (file: File) => {
    console.log('[paperStore] Uploading file to backend:', file.name);

    const dto = await uploadPaperToBackend(file);
    const paper = backendResponseToPaper(dto);

    const state = get();

    // Build edges: connect new paper to existing papers that share citations/keywords
    const newEdges = [...state.edges];
    state.papers.forEach(existingPaper => {
      // Check for shared keywords
      const sharedKeywords = paper.keywords.filter(k =>
        existingPaper.keywords.includes(k)
      );
      // Check for shared citation titles
      const sharedCitations = paper.citations.filter(c =>
        existingPaper.citations.some(ec =>
          ec.title.toLowerCase() === c.title.toLowerCase() ||
          (ec.doi && ec.doi === c.doi)
        )
      );

      if (sharedKeywords.length > 0 || sharedCitations.length > 0) {
        const strength = Math.min(1, (sharedKeywords.length * 0.2) + (sharedCitations.length * 0.3));
        newEdges.push({
          from: paper.id,
          to: existingPaper.id,
          strength,
        });
      }
    });

    set({
      papers: [...state.papers, paper],
      edges: newEdges,
      selectedPaperId: paper.id,
      showSummary: true,
    });

    return paper;
  },
}));

// Derived selector: insight cards
export function selectInsightCards(state: PaperState) {
  const dismissed = new Set(state.memory.insightsDismissed);
  return generateInsightCards(state.papers, state.edges)
    .filter(c => !dismissed.has(c.id));
}