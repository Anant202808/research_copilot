/**
 * Draft system types — mirrors the backend models exactly.
 */

export type DraftStatus = 'fresh' | 'outdated' | 'partial' | 'stale';
export type AlertLevel = 'error' | 'warning' | 'info';

export type SectionName =
    | 'introduction'
    | 'literature_review'
    | 'gaps'
    | 'discussion'
    | 'future_work'
    | 'unknown';

export interface DraftSection {
    name: SectionName;
    heading: string;
    content: string;
    paper_ids_used: string[];
    gap_ids_covered: string[];
    citation_count: number;
    status: DraftStatus;
}

export interface DraftData {
    draft_id: string;
    parent_id: string | null;
    version: number;
    status: DraftStatus;
    generated_at: string;
    regeneration_reason: string | null;
    text: string;
    sections: DraftSection[];
    paper_ids_used: string[];
    citation_count: number;
    gap_ids_covered: string[];
    content_hash: string;
}

export interface DraftAlert {
    level: AlertLevel;
    code: string;
    message: string;
    section: string | null;
    created_at: string;
}

export interface DraftDiff {
    from_version: number;
    to_version: number;
    from_id: string;
    to_id: string;
    regeneration_reason: string | null;
    sections_added: string[];
    sections_removed: string[];
    sections_changed: string[];
    citation_delta: number;
    paper_ids_added: string[];
    paper_ids_removed: string[];
}

export interface GenerateDraftResponse {
    workflow: string;
    skipped: boolean;
    reason?: string;
    paper_count: number;
    section: string;
    draft: DraftData;
    alerts: DraftAlert[];
    diff: DraftDiff | null;
}

export interface DraftStatusResponse {
    has_draft: boolean;
    status: DraftStatus | null;
    version: number | null;
    draft_id?: string;
    generated_at?: string;
    paper_ids_used?: string[];
    citation_count?: number;
    section_count?: number;
    sections?: string[];
    alert_count?: number;
    alerts?: DraftAlert[];
}

export interface DraftVersionSummary {
    draft_id: string;
    parent_id: string | null;
    version: number;
    status: DraftStatus;
    generated_at: string;
    regeneration_reason: string | null;
    paper_ids_used: string[];
    citation_count: number;
    gap_ids_covered: string[];
    section_count: number;
    sections: string[];
    content_hash: string;
}

export interface DraftHistoryResponse {
    total_versions: number;
    versions: DraftVersionSummary[];
}
