/**
 * AI Store — manages AI status, results, errors, and processing state.
 */

import { create } from 'zustand';
import type { ExplainableInsight, GapAnalysisResult, Paper } from '../types';
import type { AIProvider, AIStatus } from '../services/aiService';
import { generateExplainableInsight } from '../data/mockData';

interface AIState {
  provider: AIProvider;
  status: AIStatus;
  statusMessage: string;
  isProcessing: boolean;
  uploadProgress: number;
  lastGapResult: GapAnalysisResult | null;
  gapConfidence: 'low' | 'medium' | 'high';
  showExplainPanel: boolean;
  explainableInsight: ExplainableInsight | null;
  lastError: string | null;

  setAIStatus: (provider: AIProvider, status: AIStatus, message: string) => void;
  setProcessing: (val: boolean) => void;
  setUploadProgress: (pct: number) => void;
  setGapResult: (result: GapAnalysisResult | null, confidence?: 'low' | 'medium' | 'high') => void;
  setError: (error: string | null) => void;
  setShowExplainPanel: (show: boolean) => void;
  requestExplanation: (suggestion: string, papers: Paper[], edges: { from: string; to: string; strength?: number }[]) => void;
}

export const useAIStore = create<AIState>((set) => ({
  provider: 'browser-fallback',
  status: 'idle',
  statusMessage: '',
  isProcessing: false,
  uploadProgress: 0,
  lastGapResult: null,
  gapConfidence: 'medium',
  showExplainPanel: false,
  explainableInsight: null,
  lastError: null,

  setAIStatus: (provider, status, message) => set({ provider, status, statusMessage: message }),

  setProcessing: (val) => set({
    isProcessing: val,
    uploadProgress: val ? 0 : 100,
  }),

  setUploadProgress: (pct) => set({ uploadProgress: Math.min(100, Math.max(0, pct)) }),

  setGapResult: (result, confidence) => set({
    lastGapResult: result,
    gapConfidence: confidence || 'medium',
  }),

  setError: (error) => set({ lastError: error }),

  setShowExplainPanel: (show) => set({ showExplainPanel: show }),

  requestExplanation: (suggestion, papers, edges) => {
    const insight = generateExplainableInsight(suggestion, papers, edges);
    set({ explainableInsight: insight, showExplainPanel: true });
  },
}));
