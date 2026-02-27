/**
 * Draft service — all draft-related API calls.
 */

import type {
    GenerateDraftResponse,
    DraftStatusResponse,
    DraftHistoryResponse,
    DraftData,
    DraftAlert,
    DraftDiff,
    SectionName,
} from '../types/draft';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
}

// ── Generate full draft ───────────────────────────────────────────────────────
export async function generateDraftV2(
    paperIds: string[],
    section: string = 'literature review',
    gapIds: string[] = [],
    reason?: string,
    force: boolean = false,
): Promise<GenerateDraftResponse> {
    return apiFetch<GenerateDraftResponse>(`${API}/api/generate-draft`, {
        method: 'POST',
        body: JSON.stringify({
            paper_ids: paperIds,
            section,
            gap_ids: gapIds,
            reason,
            force,
        }),
    });
}

// ── Regenerate a single section ───────────────────────────────────────────────
export async function regenerateSection(
    sectionName: SectionName,
    paperIds: string[],
    gapIds: string[] = [],
    reason?: string,
): Promise<GenerateDraftResponse> {
    return apiFetch<GenerateDraftResponse>(`${API}/api/generate-draft/section`, {
        method: 'POST',
        body: JSON.stringify({
            section: sectionName,
            paper_ids: paperIds,
            gap_ids: gapIds,
            reason,
        }),
    });
}

// ── Get current draft ─────────────────────────────────────────────────────────
export async function getCurrentDraft(): Promise<{
    draft: DraftData;
    alerts: DraftAlert[];
}> {
    return apiFetch(`${API}/api/draft`);
}

// ── Draft status (lightweight — no full content) ──────────────────────────────
export async function getDraftStatus(): Promise<DraftStatusResponse> {
    return apiFetch(`${API}/api/draft/status`);
}

// ── Version history ───────────────────────────────────────────────────────────
export async function getDraftHistory(
    full: boolean = false,
): Promise<DraftHistoryResponse> {
    const q = full ? '?full=true' : '';
    return apiFetch(`${API}/api/draft/history${q}`);
}

// ── Specific version ──────────────────────────────────────────────────────────
export async function getDraftVersion(
    version: number,
): Promise<{ draft: DraftData }> {
    return apiFetch(`${API}/api/draft/version/${version}`);
}

// ── Diff between two versions ─────────────────────────────────────────────────
export async function getDraftDiff(
    from: number,
    to: number,
): Promise<DraftDiff> {
    return apiFetch(`${API}/api/draft/diff?from=${from}&to=${to}`);
}