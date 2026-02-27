/**
 * UI Store — loading states, modals, selections, dark mode, keyboard nav.
 */

import { create } from 'zustand';

interface UIState {
  // Dark mode
  darkMode: boolean;

  // Loading skeletons
  loadingGraph: boolean;
  loadingTimeline: boolean;
  loadingCitations: boolean;
  loadingGaps: boolean;

  // Modals & panels
  showUploadModal: boolean;
  showKeyboardHelp: boolean;

  // Graph interaction
  graphHighlightNodes: string[];
  graphZoom: number;

  // Actions
  toggleDarkMode: () => void;
  setDarkMode: (val: boolean) => void;
  setLoading: (key: 'graph' | 'timeline' | 'citations' | 'gaps', val: boolean) => void;
  setShowUploadModal: (val: boolean) => void;
  setShowKeyboardHelp: (val: boolean) => void;
  setGraphHighlightNodes: (ids: string[]) => void;
  setGraphZoom: (zoom: number) => void;
  clearGraphHighlight: () => void;
  navigateToGraph: (nodeIds: string[]) => void;
}

// Persist dark mode preference
const savedDarkMode = (() => {
  try {
    return localStorage.getItem('rg_dark_mode') === 'true';
  } catch {
    return false;
  }
})();

export const useUIStore = create<UIState>((set) => ({
  darkMode: savedDarkMode,
  loadingGraph: false,
  loadingTimeline: false,
  loadingCitations: false,
  loadingGaps: false,
  showUploadModal: false,
  showKeyboardHelp: false,
  graphHighlightNodes: [],
  graphZoom: 1,

  toggleDarkMode: () => set(s => {
    const next = !s.darkMode;
    try { localStorage.setItem('rg_dark_mode', String(next)); } catch { /* noop */ }
    return { darkMode: next };
  }),

  setDarkMode: (val) => {
    try { localStorage.setItem('rg_dark_mode', String(val)); } catch { /* noop */ }
    set({ darkMode: val });
  },

  setLoading: (key, val) => {
    const map = {
      graph: 'loadingGraph',
      timeline: 'loadingTimeline',
      citations: 'loadingCitations',
      gaps: 'loadingGaps',
    } as const;
    set({ [map[key]]: val });
  },

  setShowUploadModal: (val) => set({ showUploadModal: val }),
  setShowKeyboardHelp: (val) => set({ showKeyboardHelp: val }),
  setGraphHighlightNodes: (ids) => set({ graphHighlightNodes: ids }),
  setGraphZoom: (zoom) => set({ graphZoom: zoom }),
  clearGraphHighlight: () => set({ graphHighlightNodes: [] }),

  navigateToGraph: (nodeIds) => {
    set({ graphHighlightNodes: nodeIds });
    // Auto-clear after 5s
    setTimeout(() => set({ graphHighlightNodes: [] }), 5000);
  },
}));
