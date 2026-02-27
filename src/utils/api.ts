/**
 * API client for the ResearchGraph AI Flask backend.
 *
 * When the backend is running (VITE_API_URL is set), all calls go to it.
 * Otherwise the app falls back to the mock data in data/mockData.ts.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Upload ──
export async function uploadPaper(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/upload-paper`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || `Upload failed (${res.status})`);
  }
  return res.json();
}

// ── Papers ──
export const fetchPapers = () => request<{ papers: unknown[]; count: number }>("/api/papers");
export const fetchPaper = (id: string) => request(`/api/papers/${id}`);
export const deletePaper = (id: string) =>
  request(`/api/papers/${id}`, { method: "DELETE" });

// ── Summary ──
export const fetchSummary = (id: string) => request(`/api/summary/${id}`);

// ── Graph ──
export const fetchGraph = () => request<{ nodes: unknown[]; edges: unknown[] }>("/api/graph");

// ── Citations ──
export const extractCitations = (paperId: string, format: string) =>
  request<{ citations: string[] }>("/api/extract-citations", {
    method: "POST",
    body: JSON.stringify({ paper_id: paperId, format }),
  });

// ── Gap Analysis ──
export const findGaps = (paperIds: string[]) =>
  request("/api/find-gaps", {
    method: "POST",
    body: JSON.stringify({ paper_ids: paperIds }),
  });

// ── Health check — returns true if backend is reachable ──
export async function isBackendAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
